const {contextBridge: contextBridge, ipcRenderer: ipcRenderer} = require("electron");

const NS = "qwqnt.message-to-image";

try {
    contextBridge.exposeInMainWorld("messageToImage", {
        saveBase64ToFile: (fileName, base64, overrideDir) => ipcRenderer.invoke(`${NS}.saveBase64ToFile`, fileName, base64, overrideDir),
        pickSaveDir: () => ipcRenderer.invoke(`${NS}.pickSaveDir`),
        log: (...args) => ipcRenderer.send(`${NS}.log`, ...args),
        loadHtml2canvas: () => ipcRenderer.invoke(`${NS}.loadHtml2canvas`),
        fetchMsgByMsgId: (peer, msgId, msgSeq, timeoutMs) => ipcRenderer.invoke(`${NS}.fetchMsgByMsgId`, peer, msgId, msgSeq, timeoutMs),
        readImageAsDataUrl: filePath => ipcRenderer.invoke(`${NS}.readImageAsDataUrl`, filePath),
        reloadPlugin: () => ipcRenderer.invoke(`${NS}.reloadPlugin`)
    });
} catch (err) {
    console.error("[消息转图片] contextBridge 注入失败", err);
}
