// preload：把保存图片能力桥接到渲染进程 window。
// 配置读写改由 qwqnt-hako 的 PluginSettings 直接在 renderer 侧完成，无需在此中转。
const { contextBridge, ipcRenderer } = require("electron");

const NS = "qwqnt.message-to-image";

contextBridge.exposeInMainWorld("messageToImage", {
  // 保存 base64 图片到本地（有固定目录则直接写，否则弹出保存对话框）
  saveBase64ToFile: (fileName, base64) => ipcRenderer.send(`${NS}.saveBase64ToFile`, fileName, base64),
  // 将渲染进程日志转发到主进程终端（便于排查）
  log: (...args) => ipcRenderer.send(`${NS}.log`, ...args),
});
