// preload：把保存与配置读取能力桥接到渲染进程 window。
const { contextBridge, ipcRenderer } = require("electron");

const NS = "qwqnt.message-to-image";

contextBridge.exposeInMainWorld("messageToImage", {
  // 保存 base64 图片到本地（有固定目录则直接写，否则弹出保存对话框）
  saveBase64ToFile: (fileName, base64) => ipcRenderer.send(`${NS}.saveBase64ToFile`, fileName, base64),
  // 读取插件配置（每次调用返回磁盘最新配置）
  getConfig: () => ipcRenderer.invoke(`${NS}.getConfig`),
  // 将渲染进程日志转发到主进程终端（便于排查）
  log: (...args) => ipcRenderer.send(`${NS}.log`, ...args),
});
