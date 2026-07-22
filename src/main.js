// 主进程：接收渲染进程发来的 base64 图片并保存到磁盘。
// 配置读写全面迁移到 qwqnt-hako 的 PluginSettings（三端通用的 readConfig/writeConfig）。
const { ipcMain, dialog } = require("electron");
const { writeFileSync, existsSync } = require("fs");
const path = require("path");

const NS = "qwqnt.message-to-image";
const CH_SAVE = `${NS}.saveBase64ToFile`;

// hako 用插件 id 区分各插件配置；与 package.json 的 name 保持一致
const CONFIG_ID = "qwqnt-message-to-image";

// 默认配置：hako 在配置文件不存在时会把它作为默认值写入
const defaultConfig = {
  // 渲染倍率：图片分辨率放大倍数。1=原始，2=高清，可填 3、4 等更高值
  scale: 2,
  // 固定保存目录：留空则每次弹出保存对话框；填写绝对路径则直接保存到该目录
  savePath: "",
};

// 只保留已知字段并补齐缺失项，倍率做合法性校验
function normalizeConfig(raw) {
  const src = raw || {};
  const n = Number(src.scale);
  return {
    scale: Number.isFinite(n) && n > 0 ? n : defaultConfig.scale,
    savePath: typeof src.savePath === "string" ? src.savePath : "",
  };
}

// 通过 hako 读取配置。hako 未就绪时回退到默认值。
function loadConfig() {
  try {
    if (typeof PluginSettings !== "undefined" && PluginSettings?.main?.readConfig) {
      return normalizeConfig(PluginSettings.main.readConfig(CONFIG_ID, defaultConfig));
    }
  } catch (err) {
    console.error("[消息转图片] 读取配置失败", err);
  }
  return { ...defaultConfig };
}

// ---------------------------------------------------------------------------
// 保存图片
// ---------------------------------------------------------------------------
ipcMain.on(`${NS}.log`, (_event, ...args) => {
  console.log("[消息转图片][渲染]", ...args);
});

ipcMain.on(CH_SAVE, async (_event, fileName, base64) => {
  try {
    const config = loadConfig();
    const buffer = Buffer.from(base64.split(",")[1], "base64");

    // 已配置固定目录且存在 → 直接写入
    if (config.savePath && existsSync(config.savePath)) {
      writeFileSync(path.join(config.savePath, fileName), buffer, { encoding: null });
      return;
    }

    // 否则弹出保存对话框
    const result = await dialog.showSaveDialog({
      title: "选择图片保存位置",
      message: "选择图片保存位置",
      defaultPath: fileName,
      properties: ["dontAddToRecent"],
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
    });
    if (!result.canceled && result.filePath) {
      writeFileSync(result.filePath, buffer, { encoding: null });
    }
  } catch (err) {
    console.error("[消息转图片] 保存失败", err);
  }
});

console.log("[消息转图片] main 已加载 (配置由 qwqnt-hako 管理)");
