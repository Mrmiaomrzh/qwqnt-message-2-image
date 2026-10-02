(function() {
    "use strict";
    const pluginPackageJson = {
        name: "qwqnt-message-to-image",
        qwqnt: {
            name: "消息转图片"
        }
    };
    if (typeof window.__m2i_cleanup === "function") {
        try {
            window.__m2i_cleanup();
        } catch (err) {
            console.error("[消息转图片] 清理旧实例失败", err);
        }
    }
    const instanceToken = window.__m2i_token = (window.__m2i_token || 0) + 1;
    const imageIcon = `<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M885.76 204.8v614.4H138.24V204.8h747.52m10.24-71.68H128c-33.93024 0-61.44 27.50976-61.44 61.44v634.88c0 33.93024 27.50976 61.44 61.44 61.44h768c33.93024 0 61.44-27.50976 61.44-61.44V194.56c0-33.93024-27.50976-61.44-61.44-61.44z" fill="currentColor"></path><path d="M256.03584 718.40768a35.81952 35.81952 0 0 1-30.89408-17.6128c-9.91744-16.7424-3.83488-38.46656 12.49792-49.03936l190.45376-123.26912a40.96 40.96 0 0 1 44.08832-0.27136l101.376 63.86176a20.48 20.48 0 0 0 22.36416-0.34816l182.76864-123.20768a35.84512 35.84512 0 0 1 50.36544 10.61888c10.46528 16.59392 4.72576 38.68672-11.54048 49.65376l-209.19296 141.02016a40.94976 40.94976 0 0 1-44.72832 0.6912l-101.95456-64.22528a20.46976 20.46976 0 0 0-22.0416 0.13824l-164.11648 106.22464a35.67104 35.67104 0 0 1-19.44576 5.76512z" fill="currentColor"></path><path d="M337.92 373.76m-51.2 0a51.2 51.2 0 1 0 102.4 0 51.2 51.2 0 1 0 102.4 0Z" fill="currentColor"></path></svg>`;
    function logMain(...args) {
        console.log("[消息转图片]", ...args);
        try {
            window.messageToImage?.log?.(...args);
        } catch {}
    }
    function el(tag, style, ...children) {
        const node = document.createElement(tag);
        if (style) Object.assign(node.style, style);
        for (const child of children.flat()) {
            if (child == null || child === "") continue;
            node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
        }
        return node;
    }
    function truncate(text, max) {
        const s = String(text || "");
        return s.length > max ? s.slice(0, max) + "…" : s;
    }
    function blobToDataUrl(blob) {
        return new Promise(resolve => {
            const reader = new FileReader;
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => resolve("");
            reader.readAsDataURL(blob);
        });
    }
    async function srcToDataUrl(src, loadedEl) {
        if (!src) return null;
        if (src.startsWith("data:")) return src;
        if (/^appimg:\/\//i.test(src)) {
            try {
                const localUrl = await readLocalImage(decodeURIComponent(src.replace(/^appimg:\/\//i, "")));
                if (localUrl) return localUrl;
            } catch {}
        }
        if (loadedEl && loadedEl.complete && loadedEl.naturalWidth > 0) {
            try {
                const maxSide = Math.max(loadedEl.naturalWidth, loadedEl.naturalHeight);
                const ratio = maxSide > 1024 ? 1024 / maxSide : 1;
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(loadedEl.naturalWidth * ratio);
                canvas.height = Math.round(loadedEl.naturalHeight * ratio);
                canvas.getContext("2d").drawImage(loadedEl, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL("image/png", 1);
            } catch {}
        }
        try {
            const resp = await fetch(src);
            if (resp.ok) {
                const dataUrl = await blobToDataUrl(await resp.blob());
                if (dataUrl) return dataUrl;
            }
        } catch {}
        return src;
    }
    async function readLocalImage(filePath) {
        try {
            const res = await (window.messageToImage?.readImageAsDataUrl?.(filePath));
            if (res?.ok && res.dataUrl) return res.dataUrl;
        } catch {}
        return null;
    }
    function normalizeThumbPath(thumbPath) {
        if (!thumbPath) return [];
        const entries = thumbPath instanceof Map ? Array.from(thumbPath.entries()) : Object.entries(thumbPath);
        return entries.map(([k, v]) => ({
            key: Number(k) || 0,
            path: String(v || "")
        })).filter(it => it.path).sort((a, b) => a.key - b.key).map(it => it.path);
    }
    async function resolvePicToDataUrl(picElement) {
        if (!picElement) return null;
        if (picElement.sourcePath) {
            const url = await readLocalImage(picElement.sourcePath);
            if (url) return url;
        }
        for (const tp of normalizeThumbPath(picElement.thumbPath)) {
            const url = await readLocalImage(tp);
            if (url) return url;
        }
        return null;
    }
    function extractStickerData(msgRecord) {
        const elements = msgRecord?.elements || [];
        let content = "";
        let reply = null;
        const images = [];
        const emojis = [];
        for (const item of elements) {
            if (item.replyElement) {
                const re = item.replyElement;
                const preview = String(re.sourceMsgText || "").trim();
                const previewPath = /^([a-zA-Z]:\\|\/).+\.(jpe?g|png|gif|webp|bmp)$/i.test(preview) ? preview : "";
                reply = {
                    msgIds: [ ...new Set([ re.sourceMsgIdInRecords, re.replayMsgId ].map(v => String(v || "").trim()).filter(Boolean)) ],
                    msgSeq: String(re.replayMsgSeq || ""),
                    preview: preview,
                    previewPath: previewPath,
                    isPic: Boolean(re.sourceMsgIsIncPic) || Boolean(previewPath),
                    senderUin: String(re.senderUin || re.senderUidStr || ""),
                    expired: Boolean(re.sourceMsgExpired)
                };
            } else if (item.picElement) {
                const pe = item.picElement;
                images.push({
                    sourcePath: String(pe.sourcePath || ""),
                    thumbPath: normalizeThumbPath(pe.thumbPath),
                    fileName: String(pe.fileName || ""),
                    picWidth: Number(pe.picWidth) || 0,
                    picHeight: Number(pe.picHeight) || 0,
                    slot: true,
                    selector: "img.pic-element, .pic-element img"
                });
            } else if (item.marketFaceElement) {
                const mfe = item.marketFaceElement;
                emojis.push({
                    sourcePath: String(mfe.staticFacePath || mfe.dynamicFacePath || ""),
                    thumbPath: [],
                    emojiName: String(mfe.faceName || mfe.emojiName || ""),
                    emoji: true,
                    selector: "img.market-face-element, .market-face-element img, .market-face-element canvas"
                });
            } else if (item.faceElement) {
                const fe = item.faceElement;
                emojis.push({
                    sourcePath: "",
                    thumbPath: [],
                    emojiName: String(fe.faceText || ""),
                    emoji: true,
                    selector: "img.face-element__icon, .face-element img"
                });
            } else if (item.textElement) {
                content += item.textElement.content || "";
            } else if (item.atElement) {
                content += item.atElement.content || item.atElement.displayText || "@";
            }
        }
        content = content.trim();
        if (content || images.length) {
            content = (content + emojis.map(e => `[${e.emojiName || "表情"}]`).join("")).trim();
        } else if (emojis.length) {
            images.push(...emojis);
        }
        if (!content && !reply && !images.length) return null;
        return {
            content: content,
            reply: reply,
            images: images
        };
    }
    function parseReplyRecord(record) {
        if (!record || !Array.isArray(record.elements)) return null;
        const sender = record.sendMemberName || record.sendNickName || record.sendRemarkName || "";
        let text = "";
        let picElement = null;
        for (const item of record.elements) {
            if (item.textElement) {
                text += item.textElement.content || "";
            } else if (item.picElement && !picElement) {
                picElement = item.picElement;
            } else if (item.atElement) {
                text += item.atElement.content || item.atElement.displayText || "@";
            } else if (item.faceElement) {
                text += item.faceElement.faceText || "[表情]";
            } else if (item.marketFaceElement) {
                text += item.marketFaceElement.emojiName || "[表情]";
            }
        }
        text = text.trim();
        if (!text && !picElement) return null;
        return {
            sender: String(sender || ""),
            text: text,
            picElement: picElement
        };
    }
    let msgSticker = null;
    const CONFIG_ID = "qwqnt-message-to-image";
    const DEFAULT_CONFIG = {
        scale: 2,
        saveToLocal: true,
        savePath: "",
        copyToClipboard: true,
        multiMode: "merge"
    };
    let pluginConfig = {
        ...DEFAULT_CONFIG
    };
    function normalizeConfig(raw) {
        const src = raw || {};
        const n = Number(src.scale);
        return {
            scale: Number.isFinite(n) && n > 0 ? n : DEFAULT_CONFIG.scale,
            saveToLocal: src.saveToLocal === undefined ? true : Boolean(src.saveToLocal),
            savePath: typeof src.savePath === "string" ? src.savePath : "",
            copyToClipboard: src.copyToClipboard === undefined ? true : Boolean(src.copyToClipboard),
            multiMode: src.multiMode === "single" ? "single" : "merge"
        };
    }
    function readConfig() {
        try {
            if (typeof PluginSettings !== "undefined" && PluginSettings?.renderer?.readConfig) {
                return normalizeConfig(PluginSettings.renderer.readConfig(CONFIG_ID, DEFAULT_CONFIG));
            }
        } catch (err) {
            logMain("读取配置失败", err?.message || String(err));
        }
        return {
            ...DEFAULT_CONFIG
        };
    }
    function writeConfig(cfg) {
        try {
            if (typeof PluginSettings !== "undefined" && PluginSettings?.renderer?.writeConfig) {
                return PluginSettings.renderer.writeConfig(CONFIG_ID, cfg);
            }
        } catch (err) {
            logMain("写入配置失败", err?.message || String(err));
        }
        return false;
    }
    function refreshConfig() {
        pluginConfig = readConfig();
        return pluginConfig;
    }
    refreshConfig();
    function getParentElement(element, className) {
        let el = element;
        while (el && el !== document.body) {
            if (el.classList && el.classList.contains(className)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }
    function isDarkTheme() {
        const theme = document.body.getAttribute("q-theme") || document.documentElement.getAttribute("q-theme");
        if (theme) {
            return theme.includes("dark");
        }
        const bg = getComputedStyle(document.body).backgroundColor;
        const match = bg.match(/\d+/g);
        if (match && match.length >= 3) {
            const [r, g, b] = match.map(Number);
            return r * .299 + g * .587 + b * .114 < 128;
        }
        return false;
    }
    function extractBgUrl(elm) {
        const bg = getComputedStyle(elm).backgroundImage;
        const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
        return m ? m[1] : "";
    }
    function looksLikeAvatar(url) {
        return /qlogo\.cn|appavatar|nt_data\/Avatar|\/avatar|头像/i.test(url);
    }
    function findAvatarIn(scope) {
        let node = scope.querySelector(".avatar-span img, .avatar img, img.avatar, .q-avatar img, .message__avatar img, [class*='avatar'] img, [class*='Avatar'] img");
        if (node && node.src) return {
            img: node,
            url: node.src
        };
        node = Array.from(scope.querySelectorAll("img")).find(img => looksLikeAvatar(img.src));
        if (node && node.src) return {
            img: node,
            url: node.src
        };
        const bgHost = scope.querySelector("[class*='avatar'], [class*='Avatar'], .q-avatar");
        if (bgHost) {
            const url = extractBgUrl(bgHost);
            if (url) return {
                img: null,
                url: url
            };
        }
        const all = scope.querySelectorAll("*");
        for (const node of all) {
            const url = extractBgUrl(node);
            if (url && looksLikeAvatar(url)) return {
                img: null,
                url: url
            };
        }
        return {
            img: null,
            url: ""
        };
    }
    function getUserName(messageEl, msgRecord) {
        const fromRecord = msgRecord?.sendMemberName || msgRecord?.sendNickName || msgRecord?.sendRemarkName || msgRecord?.anonymousExtInfo?.anonymousNick || "";
        if (fromRecord) return fromRecord;
        let scope = messageEl;
        for (let i = 0; i < 6 && scope; i++) {
            const nameEl = scope.querySelector(".message__nickname, .user-name, .q-title, [class*='nickname'], [class*='Nickname'], [class*='userName'], [class*='UserName']");
            const text = nameEl?.innerText?.trim();
            if (text) return text;
            scope = scope.parentElement;
        }
        const avatarEl = messageEl.querySelector("[class*='avatar'] img, [class*='Avatar'] img, .avatar-span img");
        const alt = (avatarEl?.getAttribute("alt") || avatarEl?.getAttribute("title") || "").trim();
        if (alt) return alt;
        const aioTitle = document.querySelector(".aio-nickname, .aio-content-title, .chat-header .name, [class*='aio'] [class*='title']");
        const titleText = aioTitle?.innerText?.trim();
        if (titleText) return titleText;
        logMain("未找到昵称");
        return "";
    }
    function getAvatarImg(messageEl) {
        let scope = messageEl;
        let result = findAvatarIn(scope);
        for (let i = 0; i < 5 && !result.url; i++) {
            if (!scope.parentElement) break;
            scope = scope.parentElement;
            result = findAvatarIn(scope);
        }
        if (!result.url) logMain("未找到头像");
        return result;
    }
    function colors(isDark) {
        return isDark ? {
            nickname: "#808080",
            bubble: "#262626",
            text: "#f2f2f2",
            quoteBg: "rgba(255,255,255,0.08)",
            quoteText: "#808080",
            quoteBorder: "#5a5a5a",
            avatarBg: "#404040",
            fallbackBg: "#1f1f1f",
            fallbackText: "#808080"
        } : {
            nickname: "#999999",
            bubble: "#ffffff",
            text: "#333333",
            quoteBg: "rgba(0,0,0,0.05)",
            quoteText: "#999999",
            quoteBorder: "#cccccc",
            avatarBg: "#e0e0e0",
            fallbackBg: "#f0f0f0",
            fallbackText: "#999999"
        };
    }
    function buildStickerRow(data) {
        const C = colors(data.isDark);
        const fontFamily = data.fontFamily || "inherit";
        const hasQuote = Boolean(data.replyInfo);
        const hasText = Boolean(data.content);
        const bubbleChildren = [];
        if (hasQuote) {
            const r = data.replyInfo;
            const quoteChildren = [];
            if (r.imgUrl) {
                const img = el("img", {
                    maxWidth: "64px",
                    maxHeight: "64px",
                    borderRadius: "4px",
                    display: "inline-block",
                    verticalAlign: "top"
                });
                img.src = r.imgUrl;
                quoteChildren.push(img);
            }
            const label = (r.sender ? r.sender + "：" : "") + (r.text || (r.imgUrl ? "" : "[引用消息]"));
            if (label) {
                quoteChildren.push(el("div", {
                    fontSize: "12px",
                    lineHeight: "17px",
                    color: C.quoteText,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    display: "inline-block",
                    verticalAlign: "top",
                    maxWidth: r.imgUrl ? "240px" : "100%"
                }, truncate(label, 140)));
            }
            bubbleChildren.push(el("div", {
                background: C.quoteBg,
                borderLeft: `3px solid ${C.quoteBorder}`,
                borderRadius: "4px",
                padding: "6px 8px",
                marginBottom: hasText || data.imageUrls.length ? "6px" : "0",
                fontSize: "0"
            }, quoteChildren));
        }
        if (hasText) {
            bubbleChildren.push(el("div", {
                fontSize: "14px",
                lineHeight: "20px",
                color: C.text,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
            }, data.content));
        }
        data.imageUrls.forEach((entry, index) => {
            const marginTop = hasQuote || hasText || index > 0 ? "6px" : "0";
            if (entry && entry.url && entry.w && entry.h) {
                const img = el("img", {
                    width: entry.w + "px",
                    height: entry.h + "px",
                    borderRadius: "6px",
                    display: "block",
                    marginTop: marginTop
                });
                img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                slotCounter += 1;
                slotImageMap.set(slotCounter, entry.url);
                img.dataset.m2iSlot = String(slotCounter);
                bubbleChildren.push(img);
            } else if (entry && entry.url) {
                const img = el("img", {
                    maxWidth: "336px",
                    maxHeight: "336px",
                    borderRadius: "6px",
                    display: "block",
                    marginTop: marginTop
                });
                img.src = entry.url;
                bubbleChildren.push(img);
            } else if (entry && entry.text) {
                bubbleChildren.push(el("div", {
                    fontSize: "14px",
                    lineHeight: "20px",
                    color: C.text,
                    wordBreak: "break-word",
                    marginTop: marginTop
                }, entry.text));
            } else {
                bubbleChildren.push(el("div", {
                    marginTop: marginTop,
                    width: "160px",
                    height: "90px",
                    borderRadius: "6px",
                    boxSizing: "border-box",
                    border: `1px dashed ${C.quoteBorder}`,
                    background: C.fallbackBg,
                    color: C.fallbackText,
                    fontSize: "12px",
                    textAlign: "center",
                    lineHeight: "88px"
                }, "图片加载失败"));
            }
        });
        const bubble = el("div", {
            background: C.bubble,
            borderRadius: "8px",
            padding: "10px 12px",
            maxWidth: "360px",
            display: "inline-block",
            boxSizing: "border-box"
        }, bubbleChildren);
        const main = el("div", {
            display: "inline-block",
            verticalAlign: "top",
            marginLeft: "10px"
        }, data.userName ? el("div", {
            fontSize: "12px",
            lineHeight: "17px",
            color: C.nickname,
            marginBottom: "4px"
        }, data.userName) : null, bubble);
        let avatarNode;
        if (data.avatarUrl) {
            const img = el("img", {
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                display: "block"
            });
            img.src = data.avatarUrl;
            avatarNode = el("div", {
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                overflow: "hidden"
            }, img);
        } else {
            const initial = (data.userName || "?").trim().charAt(0).toUpperCase() || "?";
            avatarNode = el("div", {
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: C.avatarBg,
                color: C.text,
                fontSize: "16px",
                textAlign: "center",
                lineHeight: "32px"
            }, initial);
        }
        return el("div", {
            fontFamily: data.fontFamily || "inherit"
        }, el("div", {
            display: "inline-block",
            verticalAlign: "top"
        }, avatarNode), main);
    }
    function buildStickerNode(data) {
        return el("div", {
            position: "absolute",
            left: "-10000px",
            top: "0px",
            display: "inline-block",
            padding: "6px"
        }, buildStickerRow(data));
    }
    function buildStickerNodes(data) {
        slotCounter = 0;
        slotImageMap.clear();
        const list = data.messages || [];
        if (list.length === 1) return buildStickerNode(list[0]);
        return el("div", {
            position: "absolute",
            left: "-10000px",
            top: "0px",
            display: "inline-block",
            padding: "6px"
        }, list.map((msg, index) => el("div", {
            marginTop: index > 0 ? "12px" : "0",
            fontFamily: msg.fontFamily || "inherit"
        }, buildStickerRow({
            ...msg,
            isDark: data.isDark
        }))));
    }
    function findQuotedRecordInDom(msgIds, msgSeq) {
        for (const el of document.querySelectorAll(".message")) {
            const record = getMessageRecordFromEl(el);
            if (!record) continue;
            if (msgIds.includes(String(record.msgId || ""))) return {
                el: el,
                record: record
            };
            if (msgSeq && Number(record.msgSeq) === Number(msgSeq)) return {
                el: el,
                record: record
            };
        }
        return null;
    }
    async function resolveReplyInfo(config) {
        const reply = config.reply;
        if (!reply) return null;
        const msgIds = Array.isArray(reply.msgIds) && reply.msgIds.length ? reply.msgIds : [];
        for (const msgId of msgIds) {
            if (!config.peer?.peerUid) break;
            try {
                const res = await (window.messageToImage?.fetchMsgByMsgId?.(config.peer, msgId, reply.msgSeq || "", 8e3));
                if (res?.ok && res.msgRecord) {
                    const parsed = parseReplyRecord(res.msgRecord);
                    if (parsed) {
                        const imgUrl = parsed.picElement ? await resolvePicToDataUrl(parsed.picElement) : null;
                        return {
                            sender: parsed.sender,
                            text: parsed.text,
                            imgUrl: imgUrl
                        };
                    }
                }
                logMain(`拉取引用消息(${msgId})未成功，尝试下一个候选:`, res?.message || "未知原因");
            } catch (err) {
                logMain(`拉取引用消息(${msgId})异常:`, err?.message || String(err));
            }
        }
        const hit = msgIds.length || reply.msgSeq ? findQuotedRecordInDom(msgIds, reply.msgSeq) : null;
        if (hit) {
            const parsed = parseReplyRecord(hit.record);
            if (parsed) {
                const imgUrl = parsed.picElement ? await resolvePicToDataUrl(parsed.picElement) : null;
                return {
                    sender: parsed.sender || getUserName(hit.el, hit.record),
                    text: parsed.text,
                    imgUrl: imgUrl
                };
            }
        }
        if (reply.previewPath) {
            const imgUrl = await readLocalImage(reply.previewPath);
            if (imgUrl) return {
                sender: reply.senderUin || "",
                text: "",
                imgUrl: imgUrl
            };
        }
        const preview = String(reply.preview || "");
        const text = reply.isPic ? "[图片]" : preview.trim() || "[引用消息]";
        return {
            sender: reply.senderUin || "",
            text: text,
            imgUrl: null
        };
    }
    const imageObjectCache = new Map;
    async function loadImageObject(url) {
        if (!url) return null;
        if (imageObjectCache.has(url)) return imageObjectCache.get(url);
        const img = await new Promise((resolve) => {
            const im = new Image;
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = url;
        });
        imageObjectCache.set(url, img);
        if (imageObjectCache.size > 40) {
            const oldest = imageObjectCache.keys().next().value;
            imageObjectCache.delete(oldest);
        }
        return img;
    }
    let slotCounter = 0;
    const slotImageMap = new Map;
    async function resolveImageUrls(config) {
        if (config._noImages) return [];
        const out = [];
        let genericImgs = null;
        const domBuckets = new Map;
        for (let i = 0; i < config.images.length; i++) {
            const ref = config.images[i];
            let url = null;
            url = await resolvePicToDataUrl(ref);
            if (!url && ref.selector && config.messageEl && config.messageEl.isConnected) {
                if (!domBuckets.has(ref.selector)) {
                    domBuckets.set(ref.selector, {
                        list: Array.from(config.messageEl.querySelectorAll(ref.selector)).filter(n => n.tagName === "CANVAS" || !looksLikeAvatar(n.src || "")),
                        next: 0
                    });
                }
                const bucket = domBuckets.get(ref.selector);
                const node = bucket.list[bucket.next];
                if (node) {
                    bucket.next += 1;
                    if (node.tagName === "CANVAS") {
                        try {
                            url = node.toDataURL("image/png", 1);
                        } catch {
                            url = null;
                        }
                    } else {
                        url = await srcToDataUrl(node.src, node);
                    }
                }
            }
            if (!url && !ref.emoji && config.messageEl && config.messageEl.isConnected) {
                if (!genericImgs) {
                    genericImgs = Array.from(config.messageEl.querySelectorAll("img")).filter(img => img.naturalWidth >= 40 && !looksLikeAvatar(img.src) && !/face|emoji|market|bqiao/i.test(img.className));
                }
                const genericImg = genericImgs[i];
                if (genericImg) url = await srcToDataUrl(genericImg.src, genericImg);
            }
            if (url && ref.slot) {
                const obj = await loadImageObject(url);
                if (obj && obj.naturalWidth > 0) {
                    const ratio = Math.min(336 / obj.naturalWidth, 336 / obj.naturalHeight, 1);
                    out.push({
                        url: url,
                        w: Math.max(1, Math.round(obj.naturalWidth * ratio)),
                        h: Math.max(1, Math.round(obj.naturalHeight * ratio))
                    });
                } else {
                    out.push({
                        url: url
                    });
                }
            } else if (url) {
                out.push({
                    url: url
                });
            } else if (ref.emoji) {
                logMain(`表情「${ref.emojiName || "表情"}」取图失败，用文字占位`);
                out.push({
                    text: `[${ref.emojiName || "表情"}]`
                });
            } else {
                logMain(`第 ${i + 1} 张图片加载失败`);
                out.push({
                    url: null
                });
            }
        }
        return out;
    }
    async function resolveAvatarUrl(config) {
        if (config._noImages) return null;
        if (config.avatarImg) {
            const url = await srcToDataUrl(config.avatarImg.src, config.avatarImg);
            if (url) return url;
        }
        if (config.avatarUrl) {
            const url = await srcToDataUrl(config.avatarUrl, null);
            if (url) return url;
        }
        return null;
    }
    function waitForImages(node) {
        const imgs = Array.from(node.querySelectorAll("img"));
        return Promise.all(imgs.map(img => img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise(resolve => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
        })));
    }
    async function ensureHtml2canvas() {
        if (typeof window.html2canvas === "function") return window.html2canvas;
        const res = await (window.messageToImage?.loadHtml2canvas?.());
        if (res?.ok && typeof window.html2canvas === "function") return window.html2canvas;
        throw new Error("html2canvas 加载失败: " + (res?.message || "未知原因"));
    }
    async function renderByForeignObject(node, scale) {
        const rect = node.getBoundingClientRect();
        const width = Math.ceil(rect.width);
        const height = Math.ceil(rect.height);
        if (width <= 0 || height <= 0) throw new Error("节点尺寸异常");
        const clone = node.cloneNode(true);
        clone.style.position = "static";
        clone.style.left = "0px";
        clone.style.top = "0px";
        const xml = (new XMLSerializer).serializeToString(clone);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` + `<foreignObject width="100%" height="100%">` + `<div xmlns="http://www.w3.org/1999/xhtml">${xml}</div>` + `</foreignObject></svg>`;
        const draw = (img) => {
            const canvas = document.createElement("canvas");
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext("2d");
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, width, height);
            return canvas;
        };
        const loadImage = (src) => new Promise((resolve, reject) => {
            const image = new Image;
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("SVG 图片加载失败（可能被 CSP 拦截）"));
            image.src = src;
        });
        let lastError = null;
        const sources = [];
        sources.push("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
        for (const src of sources) {
            try {
                const img = await loadImage(src);
                const canvas = draw(img);
                return canvas;
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error("foreignObject 渲染失败");
    }
    let toastTimer = null;
    function showToast(text) {
        let node = document.getElementById("m2i-toast");
        if (!node) {
            node = document.createElement("div");
            node.id = "m2i-toast";
            node.style.cssText = "position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:99999;" + "padding:8px 16px;border-radius:8px;font-size:13px;max-width:60vw;overflow:hidden;" + "text-overflow:ellipsis;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.25);" + "transition:opacity .3s;pointer-events:none;";
            document.body.appendChild(node);
        }
        const dark = isDarkTheme();
        node.style.background = dark ? "rgba(50,50,50,0.95)" : "rgba(255,255,255,0.98)";
        node.style.color = dark ? "#f2f2f2" : "#333333";
        node.textContent = text;
        node.style.opacity = "1";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            node.style.opacity = "0";
        }, 2500);
    }
    async function saveSticker(base64, overrideDir) {
        if (!window.messageToImage || !window.messageToImage.saveBase64ToFile) {
            console.error("[消息转图片] preload 未注入 window.messageToImage");
            return;
        }
        let res = null;
        try {
            res = await window.messageToImage.saveBase64ToFile(`${Date.now()}.png`, base64, overrideDir);
        } catch (err) {
            logMain("保存失败:", err?.message || String(err));
            showToast("保存失败：" + (err?.message || "未知错误"));
            return;
        }
        if (!res) return;
        const parts = [];
        if (res.copied) parts.push("已复制到剪贴板");
        if (res.saved && res.path) parts.push(`已保存到 ${res.path}`); else if (res.canceled) parts.push("已取消保存文件"); else if (res.saved === false) parts.push("未保存到本地");
        if (parts.length) showToast(parts.join("，"));
        if (res.ok === false && res.message) logMain("保存失败:", res.message);
    }
    async function resolveAllMessages(config) {
        const list = config.messages || [];
        return await Promise.all(list.map(msg => (async () => {
            const replyInfo = await resolveReplyInfo(msg);
            const imageUrls = config._noImages ? [] : await resolveImageUrls(msg);
            const avatarUrl = config._noImages ? null : await resolveAvatarUrl(msg);
            return {
                userName: msg.userName,
                content: msg.content,
                replyInfo: replyInfo,
                imageUrls: imageUrls,
                avatarUrl: avatarUrl,
                fontFamily: msg.fontFamily
            };
        })()));
    }
    async function renderSticker(config) {
        const scale = Number(config.scale) > 0 ? Number(config.scale) : 2;
        try {
            let messages = config._resolved;
            if (!messages) messages = await resolveAllMessages(config);
            if (!messages.length) return;
            const node = buildStickerNodes({
                messages: messages,
                isDark: config.isDark
            });
            document.body.appendChild(node);
            let base64 = null;
            try {
                await waitForImages(node);
                const nodeRect = node.getBoundingClientRect();
                const slotEls = Array.from(node.querySelectorAll("img[data-m2i-slot]"));
                let canvas = null;
                try {
                    canvas = await renderByForeignObject(node, scale);
                } catch (err) {
                    logMain("foreignObject 渲染失败，回退 html2canvas:", err?.message || String(err));
                    const html2canvas = await ensureHtml2canvas();
                    canvas = await html2canvas(node, {
                        backgroundColor: null,
                        scale: scale,
                        logging: false,
                        useCORS: true
                    });
                }
                const ctx = canvas.getContext("2d");
                for (const slotEl of slotEls) {
                    const url = slotImageMap.get(Number(slotEl.dataset.m2iSlot));
                    const obj = url ? imageObjectCache.get(url) : null;
                    if (!obj) continue;
                    const r = slotEl.getBoundingClientRect();
                    if (r.width <= 0 || r.height <= 0) continue;
                    try {
                        ctx.save();
                        if (ctx.roundRect) {
                            ctx.beginPath();
                            ctx.roundRect(r.left - nodeRect.left, r.top - nodeRect.top, r.width, r.height, 6);
                            ctx.clip();
                        }
                        ctx.drawImage(obj, r.left - nodeRect.left, r.top - nodeRect.top, r.width, r.height);
                        ctx.restore();
                    } catch {}
                }
                base64 = canvas.toDataURL("image/png", 1);
            } catch (err) {
                if (!config._noImages && messages.some(m => m.imageUrls.some(e => e && e.url) || m.avatarUrl)) {
                    logMain("渲染被跨域图片污染，去图重试:", err?.message || String(err));
                    return await renderSticker({
                        ...config,
                        _noImages: true,
                        _resolved: messages.map(m => ({
                            ...m,
                            imageUrls: [],
                            avatarUrl: null
                        }))
                    });
                }
                throw err;
            } finally {
                if (node.isConnected) node.remove();
            }
            if (base64) saveSticker(base64, config.overrideDir);
        } catch (err) {
            logMain("转图片失败:", err?.message || String(err));
        }
    }
    async function renderStickerBatch(config) {
        const messages = config.messages || [];
        if (config.multiMode !== "single" || messages.length <= 1) return renderSticker(config);
        let dir = "";
        if (!pluginConfig.savePath) {
            let res = null;
            try {
                res = await (window.messageToImage?.pickSaveDir?.());
            } catch (err) {
                logMain("选择目录不可用（preload/main 可能未同步更新），回退合成长图:", err?.message || String(err));
            }
            if (res === undefined) {
                showToast("逐条保存不可用，已改为合成长图");
                return renderSticker(config);
            }
            if (!res?.ok || !res.path) {
                showToast("未选择保存目录，已取消");
                logMain("未选择保存目录，已取消逐条保存");
                return;
            }
            dir = res.path;
        }
        showToast(`开始逐条保存 ${messages.length} 张…`);
        for (const msg of messages) {
            await renderSticker({
                ...config,
                messages: [msg],
                overrideDir: dir
            });
        }
    }
    const CHECKBOX_SELECTOR = '[class*="checkbox" i], [role="checkbox"], [aria-checked], [data-checked], input[type="checkbox"], [class*="check-box" i]';
    function isCheckedMarker(marker) {
        if (!marker) return false;
        const input = marker.matches?.("input") ? marker : marker.querySelector?.("input");
        if (input?.checked) return true;
        const nodes = [ marker, ...Array.from(marker.querySelectorAll("*")).slice(0, 12) ];
        for (const node of nodes) {
            const state = [ node.getAttribute?.("aria-checked"), node.getAttribute?.("data-checked"), node.getAttribute?.("data-state") ].filter(Boolean).join(" ").toLowerCase();
            const className = String(node.className?.baseVal ?? node.className ?? "").toLowerCase();
            if (state === "true" || /(^|[\s_-])(checked|selected)([\s_-]|$)/.test(`${state} ${className}`)) {
                return true;
            }
        }
        return false;
    }
    function getMessageRecordFromEl(messageEl) {
        for (const instance of messageEl?.__VUE__ || []) {
            const record = instance?.props?.msgRecord || instance?.ctx?.msgRecord || instance?.proxy?.msgRecord;
            if (record?.elements) return record;
        }
        return null;
    }
    function buildMessageData(messageEl, msgRecord) {
        const extracted = extractStickerData(msgRecord);
        if (!extracted) return null;
        const avatar = getAvatarImg(messageEl);
        return {
            msgId: String(msgRecord.msgId || ""),
            userName: getUserName(messageEl, msgRecord),
            content: extracted.content,
            reply: extracted.reply,
            images: extracted.images,
            msgSeq: Number(msgRecord.msgSeq) || 0,
            avatarImg: avatar.img,
            avatarUrl: avatar.url,
            fontFamily: getComputedStyle(messageEl).getPropertyValue("font-family"),
            messageEl: messageEl,
            peer: {
                chatType: Number(msgRecord.chatType),
                peerUid: String(msgRecord.peerUid || ""),
                guildId: String(msgRecord.guildId || "")
            }
        };
    }
    function isRowChecked(row) {
        const marker = row.querySelector(CHECKBOX_SELECTOR);
        if (marker && isCheckedMarker(marker)) return true;
        if (row.querySelector('[class*="select-mask" i], [class*="selected-mask" i]')) return true;
        return false;
    }
    function collectSelectedMessages() {
        const seen = new Set;
        const processed = new Set;
        const messages = [];
        let markerRows = 0;
        let skipped = 0;
        for (const node of document.querySelectorAll(".message, .ml-item")) {
            const messageEl = node.classList.contains("message") ? node : node.querySelector(".message") || node.closest(".message");
            if (!messageEl || processed.has(messageEl)) continue;
            processed.add(messageEl);
            const row = messageEl.closest(".ml-item") || messageEl;
            if (row.querySelector(CHECKBOX_SELECTOR)) markerRows += 1;
            if (!isRowChecked(row)) continue;
            const msgRecord = getMessageRecordFromEl(messageEl);
            const msgId = String(msgRecord?.msgId || "");
            if (msgId && seen.has(msgId)) continue;
            const data = msgRecord ? buildMessageData(messageEl, msgRecord) : null;
            if (!data) {
                skipped += 1;
                continue;
            }
            if (msgId) seen.add(msgId);
            messages.push(data);
        }
        logMain(`多选收集：扫描行=${processed.size} 含勾选标记=${markerRows} 勾选=${messages.length}`);
        if (skipped) logMain(`多选收集中跳过 ${skipped} 条无法处理的消息（可能不在当前视口或不支持转图片）`);
        return messages;
    }
    let pipelineWarmed = false;
    async function warmupRenderPipeline() {
        if (pipelineWarmed) return;
        pipelineWarmed = true;
        try {
            const probe = buildStickerNode({
                userName: "预热",
                content: "warmup",
                replyInfo: null,
                imageUrls: [],
                avatarUrl: null,
                isDark: false,
                fontFamily: "sans-serif"
            });
            document.body.appendChild(probe);
            try {
                await renderByForeignObject(probe, 1);
            } finally {
                probe.remove();
            }
        } catch {}
        ensureHtml2canvas().catch(() => {});
    }
    function onMouseUp(event) {
        if (event.button !== 2) {
            msgSticker = null;
            return;
        }
        warmupRenderPipeline();
        refreshConfig();
        msgSticker = null;
        const selected = collectSelectedMessages();
        if (selected.length >= 2) {
            msgSticker = {
                messages: selected
            };
            return;
        }
        const messageEl = getParentElement(event.target, "message");
        if (!messageEl) return;
        const msgRecord = messageEl?.__VUE__?.[0]?.props?.msgRecord || getMessageRecordFromEl(messageEl);
        if (!msgRecord) return;
        const data = buildMessageData(messageEl, msgRecord);
        if (!data) return;
        msgSticker = {
            messages: [ data ]
        };
    }
    function appendMenuItem(qContextMenu, icon, title, onClick, keepOpen) {
        const template = qContextMenu.querySelector(`.q-context-menu-item:not([disabled="true"])`) || document.querySelector(`.q-context-menu-item:not([disabled="true"])`);
        if (!template) return null;
        const item = template.cloneNode(true);
        item.style.removeProperty("color");
        const iconEl = item.querySelector(".q-icon");
        if (iconEl && icon) iconEl.innerHTML = icon;
        const textEl = item.querySelector(".q-context-menu-item__text");
        if (textEl) {
            textEl.innerText = title;
        } else {
            item.innerText = title;
        }
        item.addEventListener("click", () => {
            onClick();
            if (!keepOpen) qContextMenu.remove();
        });
        qContextMenu.appendChild(item);
        return item;
    }
    function whenBodyReady(fn) {
        if (document.body) {
            fn();
            return;
        }
        document.addEventListener("DOMContentLoaded", fn, {
            once: true
        });
    }
    const NATIVE_TOOLBAR_LABELS = [ "逐条转发", "合并转发", "保存至电脑", "收藏", "删除", "复制" ];
    const TOOLBAR_BUTTON_CLASS = "m2i-toolbar-button";
    function compactText(node) {
        return String(node?.textContent || "").replace(/\s+/g, "");
    }
    let cachedToolbar = null;
    function collectToolbarLabelEntries(scope) {
        const entries = [];
        const walker = document.createTreeWalker(scope || document.body, 4);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const label = String(node.nodeValue || "").replace(/\s+/g, "").trim();
            const element = node.parentElement;
            if (NATIVE_TOOLBAR_LABELS.includes(label) && element && !element.closest?.(`.${TOOLBAR_BUTTON_CLASS}`) && !element.closest?.(".q-context-menu")) {
                entries.push({
                    label: label,
                    element: element
                });
            }
        }
        return entries;
    }
    function findCommonAncestor(left, right) {
        for (let node = left; node && node !== document.body; node = node.parentElement) {
            if (node.contains(right)) return node;
        }
        return null;
    }
    function findNativeMultiSelectToolbar() {
        if (cachedToolbar && cachedToolbar.isConnected) {
            const cached = buildToolbarInfo(cachedToolbar);
            if (cached) return cached;
            cachedToolbar = null;
        }
        const info = scanMultiSelectToolbar();
        if (info) cachedToolbar = info.toolbar;
        return info;
    }
    function buildToolbarInfo(toolbar) {
        const entries = collectToolbarLabelEntries(toolbar);
        const labels = new Map(entries.map(e => [ e.label, e.element ]));
        if (labels.size < 4) return null;
        return {
            toolbar: toolbar,
            labels: labels
        };
    }
    function scanMultiSelectToolbar() {
        const entries = collectToolbarLabelEntries();
        const forwardEntries = entries.filter(e => e.label === "逐条转发");
        const mergeEntries = entries.filter(e => e.label === "合并转发");
        if (!forwardEntries.length || !mergeEntries.length) return null;
        for (const forward of forwardEntries) {
            for (const merge of mergeEntries) {
                let toolbar = findCommonAncestor(forward.element, merge.element);
                while (toolbar && toolbar !== document.body) {
                    const rect = toolbar.getBoundingClientRect();
                    const labels = new Map(entries.filter(e => toolbar.contains(e.element)).map(e => [ e.label, e.element ]));
                    if (rect.width >= 280 && rect.height >= 64 && rect.height <= 280 && rect.bottom >= window.innerHeight * .55 && labels.size >= 4) {
                        return {
                            toolbar: toolbar,
                            labels: labels
                        };
                    }
                    toolbar = toolbar.parentElement;
                }
            }
        }
        return null;
    }
    function findToolbarActionRoot(labelElement, toolbar) {
        let action = labelElement;
        for (let node = labelElement; node && node !== toolbar; node = node.parentElement) {
            const rect = node.getBoundingClientRect();
            const labels = NATIVE_TOOLBAR_LABELS.filter(label => compactText(node).includes(label));
            if (labels.length === 1 && rect.width >= 36 && rect.width <= 150 && rect.height >= 42 && rect.height <= 150) {
                action = node;
            }
        }
        return action;
    }
    function replaceLabelText(root, next) {
        const walker = document.createTreeWalker(root, 4);
        const texts = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
        for (const node of texts) {
            if (NATIVE_TOOLBAR_LABELS.includes(String(node.nodeValue || "").replace(/\s+/g, "").trim())) {
                node.nodeValue = next;
                return true;
            }
        }
        if (texts.length) {
            for (const node of texts) node.nodeValue = "";
            texts[texts.length - 1].nodeValue = next;
        }
        return false;
    }
    function syncToolbarButton() {
        const info = findNativeMultiSelectToolbar();
        if (!info || !info.toolbar.isConnected) return;
        if (info.toolbar.querySelector(`.${TOOLBAR_BUTTON_CLASS}`)) return;
        const sourceLabel = info.labels.get("逐条转发") || info.labels.values().next().value;
        const source = findToolbarActionRoot(sourceLabel, info.toolbar);
        if (!source || source === info.toolbar) return;
        const button = source.cloneNode(true);
        button.classList.add(TOOLBAR_BUTTON_CLASS);
        button.removeAttribute("id");
        replaceLabelText(button, "转图片");
        const nativeIcon = button.querySelector("svg");
        if (nativeIcon) nativeIcon.outerHTML = imageIcon;
        const insertLabel = info.labels.get("复制") || info.labels.values().next().value;
        const insertTarget = findToolbarActionRoot(insertLabel, info.toolbar);
        const host = insertTarget && insertTarget !== source ? findCommonAncestor(source, insertTarget) : null;
        if (host && insertTarget.parentElement === host) {
            host.insertBefore(button, insertTarget);
        } else if (host) {
            host.appendChild(button);
        } else {
            info.toolbar.appendChild(button);
        }
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            if (button.dataset.busy === "true") return;
            const selected = collectSelectedMessages();
            if (!selected.length) {
                logMain("多选转图片：未收集到任何勾选消息");
                return;
            }
            button.dataset.busy = "true";
            button.style.opacity = "0.55";
            const scale = pluginConfig.scale > 0 ? pluginConfig.scale : 2;
            Promise.resolve(renderStickerBatch({
                messages: selected,
                isDark: isDarkTheme(),
                scale: scale,
                multiMode: pluginConfig.multiMode
            })).finally(() => {
                button.dataset.busy = "false";
                button.style.opacity = "";
            });
        }, true);
        logMain("已在多选操作栏注入「转图片」按钮");
    }
    whenBodyReady(() => {
        if (window.__m2i_token !== instanceToken) return;
        let lastToolbarSync = 0;
        document.addEventListener("mouseup", onMouseUp);
        const observer = new MutationObserver(() => {
            const qContextMenu = document.querySelector(".q-context-menu:not(.message-to-image-injected)");
            if (qContextMenu) {
                qContextMenu.classList.add("message-to-image-injected");
                if (msgSticker) {
                    const scale = pluginConfig.scale > 0 ? pluginConfig.scale : 2;
                    const data = {
                        messages: msgSticker.messages,
                        isDark: isDarkTheme(),
                        scale: scale
                    };
                    const title = msgSticker.messages.length > 1 ? `转图片(${msgSticker.messages.length})` : "转图片";
                    appendMenuItem(qContextMenu, imageIcon, title, () => renderStickerBatch({
                        ...data,
                        multiMode: pluginConfig.multiMode
                    }));
                }
            }
            const now = Date.now();
            if (now - lastToolbarSync > 400) {
                lastToolbarSync = now;
                try {
                    syncToolbarButton();
                } catch (err) {
                    logMain("多选工具栏同步失败:", err?.message || String(err));
                }
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        window.__m2i_cleanup = () => {
            document.removeEventListener("mouseup", onMouseUp);
            observer.disconnect();
            for (const node of document.querySelectorAll(`.${TOOLBAR_BUTTON_CLASS}`)) node.remove();
            document.getElementById("m2i-toast")?.remove();
            try {
                delete window.__m2i_debug;
            } catch {}
            msgSticker = null;
        };
    });
    const SCALE_OPTIONS = [ "1", "2", "3", "4", "5", "6" ];
    async function triggerReload() {
        if (!window.messageToImage?.reloadPlugin) {
            showToast("当前窗口的预加载桥不含重载接口，请重启 QQ 后再试");
            return;
        }
        try {
            const res = await window.messageToImage.reloadPlugin();
            showToast(res?.ok ? "插件已重载，新开的窗口将使用新代码" : "重载失败：" + (res?.message || "未知原因"));
        } catch (err) {
            showToast("重载失败：" + (err?.message || String(err)));
        }
    }
    function bindReloadButton(button, action = triggerReload) {
        if (!button) return;
        button.addEventListener("click", async () => {
            if (button.dataset.busy === "true") return;
            button.dataset.busy = "true";
            button.style.opacity = "0.55";
            try {
                await action();
            } finally {
                button.dataset.busy = "false";
                button.style.opacity = "";
            }
        });
    }
    function buildSettingsUI(view) {
        const cfg = readConfig();
        pluginConfig = cfg;
        function persist(patch) {
            pluginConfig = normalizeConfig({
                ...pluginConfig,
                ...patch
            });
            writeConfig(pluginConfig);
            return pluginConfig;
        }
        if (customElements.get("setting-switch") && customElements.get("setting-select")) {
            view.innerHTML = `\n        <style>\n          .m2i-item-main { display: flex; flex-direction: column; }\n          .m2i-input { flex: 0 0 220px; padding: 5px 8px; border: 1px solid var(--border_dark, #ddd);\n            border-radius: 4px; background: transparent; color: var(--text_primary, #333);\n            font-size: 12px; outline: none; }\n        </style>\n        <setting-section data-title="消息转图片">\n          <setting-item data-direction="column">\n            <setting-text data-type="secondary">支持文本 / 图片 / 表情 / 引用消息的转图片。</setting-text>\n            <setting-text data-type="secondary">多选：勾选消息后点击底部操作栏中的「转图片」；保存方式可在下方设置。</setting-text>\n          </setting-item>\n          <setting-panel>\n            <setting-list data-direction="column">\n              <setting-item data-direction="row">\n                <div class="m2i-item-main">\n                  <setting-text>渲染倍率</setting-text>\n                  <setting-text data-type="secondary">图片分辨率放大倍数</setting-text>\n                </div>\n                <setting-select id="m2i-scale"></setting-select></setting-item>\n              <setting-item data-direction="row">\n                <div class="m2i-item-main">\n                  <setting-text>多选保存方式</setting-text>\n                  <setting-text data-type="secondary">合成长图拼为一张；逐条保存每条单独成图，便于单条重截</setting-text>\n                </div>\n                <setting-select id="m2i-multi"></setting-select>\n              </setting-item>\n              <setting-item data-direction="row">\n                <div class="m2i-item-main">\n                  <setting-text>复制到剪贴板</setting-text>\n                  <setting-text data-type="secondary">生成图片后自动复制，可直接粘贴发送</setting-text>\n                </div>\n                <setting-switch id="m2i-copy"></setting-switch>\n              </setting-item>\n              <setting-item data-direction="row">\n                <div class="m2i-item-main">\n                  <setting-text>保存到本地</setting-text>\n                  <setting-text data-type="secondary">关闭后仅复制到剪贴板</setting-text>\n                </div>\n                <setting-switch id="m2i-save"></setting-switch>\n              </setting-item>\n              <setting-item data-direction="row" id="m2i-path-label">\n                <div class="m2i-item-main">\n                  <setting-text>保存目录</setting-text>\n                  <setting-text data-type="secondary">留空则每次弹出保存对话框；填写绝对路径则静默保存，例如 G:\images</setting-text>\n                </div>\n              </setting-item>\n              <setting-item data-direction="row" id="m2i-path-input">\n                <input id="m2i-path" class="m2i-input" type="text" placeholder="D:\\Pictures\\QQ" />\n              </setting-item>\n              <setting-item data-direction="row">\n                <div class="m2i-item-main">\n                  <setting-text>重载插件</setting-text>\n                  <setting-text data-type="secondary">修改代码后热重载本插件；新代码对之后新开的窗口生效</setting-text>\n                </div>\n                <setting-button id="m2i-reload">重载</setting-button>\n              </setting-item>\n              \n              \n            </setting-list>\n          </setting-panel>\n          </setting-section>\n      `;
            const select = view.querySelector("#m2i-scale");
            const current = String(cfg.scale);
            const options = SCALE_OPTIONS.includes(current) ? SCALE_OPTIONS : [ ...SCALE_OPTIONS, current ];
            select.innerHTML = options.map(v => `<setting-option data-value="${v}"${v === current ? " is-selected" : ""}>${v}x</setting-option>`).join("");
            select.addEventListener("selected", event => {
                persist({
                    scale: Number(event.detail?.value)
                });
            });
            const multiSelect = view.querySelector("#m2i-multi");
            multiSelect.innerHTML = `<setting-option data-value="merge"${cfg.multiMode !== "single" ? " is-selected" : ""}>合成长图</setting-option>` + `<setting-option data-value="single"${cfg.multiMode === "single" ? " is-selected" : ""}>逐条保存</setting-option>`;
            multiSelect.addEventListener("selected", event => {
                persist({
                    multiMode: event.detail?.value === "single" ? "single" : "merge"
                });
            });
            const copySwitch = view.querySelector("#m2i-copy");
            copySwitch.setActive(Boolean(cfg.copyToClipboard));
            copySwitch.addEventListener("click", () => {
                copySwitch.setActive(!copySwitch.getActive());
                persist({
                    copyToClipboard: copySwitch.getActive()
                });
            });
            const saveSwitch = view.querySelector("#m2i-save");
            const pathLabelRow = view.querySelector("#m2i-path-label");
            const pathInputRow = view.querySelector("#m2i-path-input");
            saveSwitch.setActive(Boolean(cfg.saveToLocal));
            const applySaveState = () => {
                const on = saveSwitch.getActive();
                pathLabelRow?.setDisabled?.(!on);
                pathInputRow?.setDisabled?.(!on);
            };
            saveSwitch.addEventListener("click", () => {
                saveSwitch.setActive(!saveSwitch.getActive());
                persist({
                    saveToLocal: saveSwitch.getActive()
                });
                applySaveState();
            });
            applySaveState();
            const pathInput = view.querySelector("#m2i-path");
            pathInput.value = cfg.savePath;
            pathInput.addEventListener("change", () => {
                persist({
                    savePath: pathInput.value
                });
            });
            bindReloadButton(view.querySelector("#m2i-reload"));

            return;
        }
        view.innerHTML = `\n      <style>\n        .m2i-setting { padding: 16px; color: var(--text_primary, #333); font-size: 14px; }\n        .m2i-setting h2 { font-size: 16px; margin: 0 0 4px; }\n        .m2i-setting .m2i-desc { color: var(--text_secondary, #999); font-size: 12px; margin: 0 0 16px; }\n        .m2i-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }\n        .m2i-row label { flex: 0 0 96px; }\n        .m2i-row input[type="number"] { width: 96px; }\n        .m2i-row input[type="text"] { flex: 1; min-width: 0; }\n        .m2i-row input { padding: 6px 8px; border: 1px solid var(--border_primary, #ddd);\n          border-radius: 6px; background: var(--bg_bottom_standard, #fff); color: inherit; }\n        .m2i-hint { color: var(--text_secondary, #999); font-size: 12px; margin: -8px 0 16px 108px; }\n      </style>\n      <div class="m2i-setting">\n        <h2>消息转图片</h2>\n        <p class="m2i-desc">右键文本 / 图片 / 表情 / 引用消息即可生成图片。修改后自动保存。</p>\n        <div class="m2i-row">\n          <label for="m2i-scale">渲染倍率</label>\n          <input id="m2i-scale" type="number" min="1" step="1" />\n        </div>\n        <p class="m2i-hint">图片分辨率放大倍数。1=原始，2=高清，可填 3、4 等更高值。</p>\n        <div class="m2i-row">\n          <label for="m2i-copy">复制到剪贴板</label>\n          <input id="m2i-copy" type="checkbox" />\n        </div>\n        <p class="m2i-hint">生成图片后自动复制到系统剪贴板，可直接粘贴发送。</p>\n        <div class="m2i-row">\n          <label for="m2i-save">保存到本地</label>\n          <input id="m2i-save" type="checkbox" />\n        </div>\n        <p class="m2i-hint">关闭后仅复制到剪贴板，不写入文件。</p>\n        <div class="m2i-row">\n          <label for="m2i-multi">多选逐条保存</label>\n          <input id="m2i-multi" type="checkbox" />\n        </div>\n        <p class="m2i-hint">勾选后多选转图片每条消息单独保存一张。</p>\n        <div class="m2i-row">\n          <label for="m2i-path">保存目录</label>\n          <input id="m2i-path" type="text" placeholder="留空则每次弹出保存对话框" />\n        </div>\n        <p class="m2i-hint">填写绝对路径则静默保存到该目录，例如 G:\\images。</p>\n        <div class="m2i-row">\n          <label for="m2i-reload">重载插件</label>\n          <button id="m2i-reload" type="button">重载</button>\n        </div>\n        <p class="m2i-hint">修改代码后热重载本插件；新代码对之后新开的窗口生效。</p>\n        \n        \n      </div>\n    `;
        const scaleInput = view.querySelector("#m2i-scale");
        const copyInput = view.querySelector("#m2i-copy");
        const saveInput = view.querySelector("#m2i-save");
        const pathInput = view.querySelector("#m2i-path");
        scaleInput.value = cfg.scale;
        copyInput.checked = cfg.copyToClipboard;
        saveInput.checked = cfg.saveToLocal;
        pathInput.value = cfg.savePath;
        pathInput.disabled = !cfg.saveToLocal;
        scaleInput.addEventListener("change", () => {
            const next = persist({
                scale: scaleInput.value
            });
            scaleInput.value = next.scale;
        });
        copyInput.addEventListener("change", () => {
            persist({
                copyToClipboard: copyInput.checked
            });
        });
        saveInput.addEventListener("change", () => {
            persist({
                saveToLocal: saveInput.checked
            });
            pathInput.disabled = !saveInput.checked;
        });
        const multiInput = view.querySelector("#m2i-multi");
        multiInput.checked = cfg.multiMode === "single";
        multiInput.addEventListener("change", () => {
            persist({
                multiMode: multiInput.checked ? "single" : "merge"
            });
        });
        pathInput.addEventListener("change", () => {
            persist({
                savePath: pathInput.value
            });
        });
        bindReloadButton(view.querySelector("#m2i-reload"));

    }
    try {
        if (typeof RendererEvents !== "undefined" && RendererEvents?.onSettingsWindowCreated) {
            RendererEvents.onSettingsWindowCreated(async () => {
                try {
                    const view = await PluginSettings.renderer.registerPluginSettings(pluginPackageJson);
                    if (view) buildSettingsUI(view);
                } catch (err) {
                    logMain("注册设置页失败", err?.message || String(err));
                }
            });
        } else {
            logMain("未检测到 qwqnt-hako (RendererEvents)，设置界面不可用");
        }
    } catch (err) {
        logMain("设置界面初始化异常", err?.message || String(err));
    }
    window.__m2i_debug = {
        renderSticker: renderSticker,
        buildStickerNodes: buildStickerNodes,
        extractStickerData: extractStickerData,
        parseReplyRecord: parseReplyRecord,
        normalizeThumbPath: normalizeThumbPath,
        buildMessageData: buildMessageData,
        collectSelectedMessages: collectSelectedMessages,
        isCheckedMarker: isCheckedMarker
    };
    console.log("[消息转图片] renderer 已加载");
})();