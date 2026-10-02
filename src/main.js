const {ipcMain: ipcMain, dialog: dialog, clipboard: clipboard, nativeImage: nativeImage} = require("electron");

const {writeFileSync: writeFileSync, existsSync: existsSync, readFileSync: readFileSync, mkdirSync: mkdirSync} = require("fs");

const path = require("path");

const crypto = require("crypto");

const NS = "qwqnt.message-to-image";

const CH_SAVE = `${NS}.saveBase64ToFile`;

const CONFIG_ID = "qwqnt-message-to-image";

const defaultConfig = {
    scale: 2,
    saveToLocal: true,
    savePath: "",
    copyToClipboard: true,
    multiMode: "merge"
};

function normalizeConfig(raw) {
    const src = raw || {};
    const n = Number(src.scale);
    return {
        scale: Number.isFinite(n) && n > 0 ? n : defaultConfig.scale,
        saveToLocal: src.saveToLocal === undefined ? true : Boolean(src.saveToLocal),
        savePath: typeof src.savePath === "string" ? src.savePath : "",
        copyToClipboard: src.copyToClipboard === undefined ? true : Boolean(src.copyToClipboard),
        multiMode: src.multiMode === "single" ? "single" : "merge"
    };
}

function loadConfig() {
    try {
        if (typeof PluginSettings !== "undefined" && PluginSettings?.main?.readConfig) {
            return normalizeConfig(PluginSettings.main.readConfig(CONFIG_ID, defaultConfig));
        }
    } catch (err) {
        console.error("[消息转图片] 读取配置失败", err);
    }
    return {
        ...defaultConfig
    };
}

function getPluginPath() {
    try {
        if (typeof __self !== "undefined" && __self?.meta?.path) return __self.meta.path;
    } catch {}
    try {
        if (typeof qwqnt !== "undefined") {
            const plugin = qwqnt?.framework?.plugins?.[CONFIG_ID];
            if (plugin?.meta?.path) return plugin.meta.path;
        }
    } catch {}
    return "";
}

let html2canvasScriptCache = null;

function getHtml2canvasScript() {
    if (html2canvasScriptCache) return html2canvasScriptCache;
    const file = path.join(getPluginPath(), "vendor", "html2canvas.min.js");
    const source = readFileSync(file, "utf8");
    html2canvasScriptCache = `(() => {\n    if (typeof globalThis.html2canvas === "function") return true;\n    return (function (module, exports, define) {\n      ${source}\n      return typeof globalThis.html2canvas === "function";\n    }).call(globalThis, undefined, undefined, undefined);\n  })()`;
    return html2canvasScriptCache;
}

const nativeStates = globalThis.__m2iNativeStates || (globalThis.__m2iNativeStates = new WeakMap);

function getNativeState(webContents) {
    let state = nativeStates.get(webContents);
    if (!state) {
        state = {
            installed: false,
            waiters: new Set
        };
        nativeStates.set(webContents, state);
    }
    return state;
}

function installNativeIpc(webContents) {
    const state = getNativeState(webContents);
    if (state.installed) return state;
    const originalSend = webContents.send.bind(webContents);
    webContents.send = function(channel, ...args) {
        if (typeof channel === "string" && channel.startsWith("RM_IPCFROM_MAIN")) {
            const [response, result] = args;
            for (const waiter of Array.from(state.waiters)) {
                if (waiter.channel === channel && !waiter.settled && response?.callbackId === waiter.callbackId) {
                    waiter.settled = true;
                    clearTimeout(waiter.timer);
                    state.waiters.delete(waiter);
                    waiter.resolve([ response, result ]);
                }
            }
        }
        return originalSend(channel, ...args);
    };
    state.installed = true;
    webContents.once("destroyed", () => {
        for (const waiter of Array.from(state.waiters)) {
            waiter.settled = true;
            clearTimeout(waiter.timer);
            waiter.reject(new Error("窗口已销毁，原生调用中止"));
        }
        state.waiters.clear();
    });
    return state;
}

function isNativeFailure(value) {
    return value?.promiseStatue === "fail" || value?.promiseStatus === "fail" || value?.result === false || Number(value?.result) < 0 || Number(value?.retCode) < 0 || Number(value?.errCode) < 0;
}

function isMsgRecord(value) {
    return Boolean(value && typeof value === "object" && (value.msgId !== undefined || value.msgSeq !== undefined) && Array.isArray(value.elements));
}

function findIpcObject(value, predicate, depth = 0, seen = new WeakSet) {
    if (!value || depth > 6 || typeof value !== "object" || value instanceof Uint8Array) {
        return null;
    }
    if (seen.has(value)) return null;
    seen.add(value);
    if (predicate(value)) return value;
    const entries = value instanceof Map ? value.values() : Object.values(value);
    for (const item of entries) {
        const match = findIpcObject(item, predicate, depth + 1, seen);
        if (match) return match;
    }
    return null;
}

async function nativeInvoke(webContents, cmdName, payload, timeoutMs = 15e3) {
    const state = installNativeIpc(webContents);
    const id = webContents.id;
    const requestChannel = `RM_IPCFROM_RENDERER${id}`;
    const responseChannel = `RM_IPCFROM_MAIN${id}`;
    const listeners = ipcMain.listeners(requestChannel);
    if (!listeners.length) {
        throw new Error(`未找到 QQNT 原生 IPC 监听器 (${requestChannel})`);
    }
    const callbackId = crypto.randomUUID();
    const request = {
        peerId: id,
        callbackId: callbackId,
        type: "request",
        eventName: "ntApi"
    };
    const command = {
        cmdName: cmdName,
        cmdType: "invoke",
        payload: payload
    };
    return await new Promise((resolve, reject) => {
        const waiter = {
            callbackId: callbackId,
            channel: responseChannel,
            settled: false
        };
        waiter.timer = setTimeout(() => {
            if (!waiter.settled) {
                waiter.settled = true;
                state.waiters.delete(waiter);
                reject(new Error(`等待原生响应超时: ${cmdName}`));
            }
        }, timeoutMs);
        state.waiters.add(waiter);
        const fakeEvent = {
            sender: webContents,
            reply: (channel, ...args) => webContents.send(channel, ...args)
        };
        try {
            for (const listener of listeners) {
                listener(fakeEvent, request, command);
            }
        } catch (err) {
            if (!waiter.settled) {
                waiter.settled = true;
                clearTimeout(waiter.timer);
                state.waiters.delete(waiter);
                reject(err);
            }
        }
    });
}

async function handleLoadHtml2canvas(event) {
    const wc = event.sender;
    if (!wc || wc.isDestroyed()) return {
        ok: false,
        message: "窗口不可用"
    };
    try {
        const ok = await wc.executeJavaScript(getHtml2canvasScript(), true);
        return ok === true ? {
            ok: true
        } : {
            ok: false,
            message: "html2canvas 注入后未生效"
        };
    } catch (err) {
        html2canvasScriptCache = null;
        console.error("[消息转图片] html2canvas 注入失败", err);
        return {
            ok: false,
            message: err?.message || String(err)
        };
    }
}

async function handleFetchMsgByMsgId(event, peer, msgId, msgSeq, timeoutMs) {
    const wc = event.sender;
    try {
        if (!wc || wc.isDestroyed()) return {
            ok: false,
            message: "窗口不可用"
        };
        const cleanPeer = {
            chatType: Number(peer?.chatType),
            peerUid: String(peer?.peerUid || ""),
            guildId: String(peer?.guildId || "")
        };
        const cleanMsgId = String(msgId || "").trim();
        const cleanSeq = String(msgSeq || "").trim();
        if (!cleanPeer.peerUid || !Number.isFinite(cleanPeer.chatType) || !cleanMsgId) {
            return {
                ok: false,
                message: "peer 或 msgId 参数不完整"
            };
        }
        const [response, result] = await nativeInvoke(wc, "nodeIKernelMsgService/getMsgsByMsgId", [ {
            peer: cleanPeer,
            msgIds: [ cleanMsgId ]
        }, null ], Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 15e3);
        if (isNativeFailure(response) || isNativeFailure(result)) {
            console.error("[消息转图片] getMsgsByMsgId 原生接口返回失败:", safeJsonSnippet(response), safeJsonSnippet(result));
            return {
                ok: false,
                message: "原生接口返回失败"
            };
        }
        const record = findIpcObject([ result, response ], v => {
            if (!isMsgRecord(v)) return false;
            if (String(v.msgId) === cleanMsgId) return true;
            if (cleanSeq && String(v.msgSeq) === cleanSeq) return true;
            return false;
        });
        if (!record) {
            console.error(`[消息转图片] getMsgsByMsgId 响应中未找到目标消息 msgId=${cleanMsgId} msgSeq=${cleanSeq || "-"}，响应摘要:`, safeJsonSnippet(result) || safeJsonSnippet(response));
            return {
                ok: false,
                message: "未在响应中找到目标消息"
            };
        }
        return {
            ok: true,
            msgRecord: record
        };
    } catch (err) {
        console.error("[消息转图片] 拉取引用消息失败:", err?.message || String(err));
        return {
            ok: false,
            message: err?.message || String(err)
        };
    }
}

function safeJsonSnippet(value, max = 500) {
    try {
        const text = JSON.stringify(value);
        return text ? text.length > max ? text.slice(0, max) + "…" : text : "";
    } catch {
        return "";
    }
}

const IMAGE_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp"
};

async function handleReadImageAsDataUrl(_event, filePath) {
    try {
        const p = path.normalize(String(filePath || ""));
        const mime = IMAGE_MIME[path.extname(p).toLowerCase()];
        if (!mime) return {
            ok: false,
            message: "不支持的图片格式"
        };
        if (!existsSync(p)) return {
            ok: false,
            message: "文件不存在"
        };
        const buffer = readFileSync(p);
        return {
            ok: true,
            dataUrl: `data:${mime};base64,${buffer.toString("base64")}`
        };
    } catch (err) {
        return {
            ok: false,
            message: err?.message || String(err)
        };
    }
}

function onRendererLog(_event, ...args) {
    console.log("[消息转图片][渲染]", ...args);
}

async function handlePickSaveDir() {
    try {
        const result = await dialog.showOpenDialog({
            title: "选择逐条保存目录",
            properties: [ "openDirectory", "createDirectory" ]
        });
        if (result.canceled || !(result.filePaths || []).length) return {ok: false, canceled: true};
        return {ok: true, path: result.filePaths[0]};
    } catch (err) {
        return {ok: false, message: err?.message || String(err)};
    }
}
async function handleSaveBase64ToFile(_event, fileName, base64, overrideDir) {
    const config = loadConfig();
    const out = {
        ok: true,
        saved: false,
        silent: false,
        canceled: false,
        copied: false,
        path: ""
    };
    if (config.copyToClipboard) {
        try {
            clipboard.writeImage(nativeImage.createFromDataURL(base64));
            out.copied = true;
        } catch (err) {
            console.error("[消息转图片] 复制到剪贴板失败", err);
        }
    }
    if (!config.saveToLocal) return out;
    try {
        const buffer = Buffer.from(base64.split(",")[1], "base64");
        let dir = "";
        if (typeof overrideDir === "string" && overrideDir.trim()) {
            dir = path.normalize(overrideDir.trim());
            if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
        } else if (config.savePath && existsSync(config.savePath)) {
            dir = config.savePath;
        }
        if (dir && existsSync(dir)) {
            writeFileSync(path.join(dir, fileName), buffer, {
                encoding: null
            });
            out.saved = true;
            out.silent = true;
            out.path = dir;
            return out;
        }
        const result = await dialog.showSaveDialog({
            title: "选择图片保存位置",
            message: "选择图片保存位置",
            defaultPath: fileName,
            properties: [ "dontAddToRecent" ],
            filters: [ {
                name: "PNG 图片",
                extensions: [ "png" ]
            } ]
        });
        if (result.canceled) {
            out.canceled = true;
            return out;
        }
        if (result.filePath) {
            writeFileSync(result.filePath, buffer, {
                encoding: null
            });
            out.saved = true;
            out.path = result.filePath;
        }
    } catch (err) {
        console.error("[消息转图片] 保存失败", err);
        out.ok = false;
        out.message = err?.message || String(err);
    }
    return out;
}

function selfReload() {
    const qwqnt = global.qwqnt;
    const plugin = qwqnt?.framework?.plugins?.[CONFIG_ID];
    const pluginPath = plugin?.meta?.path;
    if (!plugin || !pluginPath) {
        return {
            ok: false,
            message: "未在 qwqnt.framework.plugins 中找到本插件，无法自重载"
        };
    }
    const namespace = plugin.meta.namespace || CONFIG_ID;
    try {
        onUnload();
        delete qwqnt.framework.plugins[namespace];
        const prefix = pluginPath + path.sep;
        for (const filename of Object.keys(require.cache)) {
            if (path.resolve(filename).startsWith(prefix)) delete require.cache[filename];
        }
        let packageJson = {};
        try {
            packageJson = JSON.parse(readFileSync(path.join(pluginPath, "package.json"), "utf8"));
        } catch {}
        const loaded = require(path.resolve(pluginPath, packageJson?.qwqnt?.inject?.main || "src/main.js"));
        const nextPlugin = {
            meta: plugin.meta
        };
        if (typeof loaded.onUnload === "function") nextPlugin.onUnload = loaded.onUnload;
        qwqnt.framework.plugins[namespace] = nextPlugin;
        if (typeof loaded.onLoad === "function") loaded.onLoad(nextPlugin);
        return {
            ok: true
        };
    } catch (err) {
        console.error("[消息转图片] 自重载失败", err);
        try {
            registerIpc();
            qwqnt.framework.plugins[namespace] = plugin;
        } catch {}
        return {
            ok: false,
            message: err?.message || String(err)
        };
    }
}

async function handleReloadPlugin() {
    const reload = global.qwqnt?.framework?.reloadPlugin;
    if (typeof reload === "function") {
        try {
            reload(CONFIG_ID);
            return {
                ok: true
            };
        } catch (err) {
            console.error("[消息转图片] 框架重载失败，改用内置自重载", err);
        }
    }
    return selfReload();
}

const HANDLE_CHANNELS = [ `${NS}.loadHtml2canvas`, `${NS}.fetchMsgByMsgId`, `${NS}.readImageAsDataUrl`, CH_SAVE, `${NS}.pickSaveDir`, `${NS}.reloadPlugin` ];

function registerIpc() {
    for (const channel of HANDLE_CHANNELS) {
        ipcMain.removeHandler(channel);
    }
    ipcMain.handle(`${NS}.loadHtml2canvas`, handleLoadHtml2canvas);
    ipcMain.handle(`${NS}.fetchMsgByMsgId`, handleFetchMsgByMsgId);
    ipcMain.handle(`${NS}.readImageAsDataUrl`, handleReadImageAsDataUrl);
    ipcMain.handle(CH_SAVE, handleSaveBase64ToFile);
    ipcMain.handle(`${NS}.pickSaveDir`, handlePickSaveDir);
    ipcMain.handle(`${NS}.reloadPlugin`, handleReloadPlugin);
    ipcMain.removeListener(`${NS}.log`, onRendererLog);
    ipcMain.on(`${NS}.log`, onRendererLog);
}

function unregisterIpc() {
    for (const channel of HANDLE_CHANNELS) {
        ipcMain.removeHandler(channel);
    }
    ipcMain.removeListener(`${NS}.log`, onRendererLog);
}

function onLoad(plugin) {
    registerIpc();
    console.log("[消息转图片] main 已加载 (配置由 qwqnt-hako 管理)");
}

function onUnload() {
    unregisterIpc();
    html2canvasScriptCache = null;
    console.log("[消息转图片] main 已卸载");
}

module.exports = {
    onLoad: onLoad,
    onUnload: onUnload
};