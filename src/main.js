// 主进程：接收渲染进程发来的 base64 图片并保存到磁盘 + JSON 配置读取。
// 配置为固定 JSON 文件，用户手动编辑；参考 lite_tools 的“模板+用户配置合并”方式。
// 使用标准 Electron IPC，QwQNT 与 LiteLoaderQQNT 均兼容。
const { ipcMain, dialog } = require("electron");
const { writeFileSync, readFileSync, existsSync, mkdirSync } = require("fs");
const path = require("path");

const NS = "qwqnt.message-to-image";
const CH_SAVE = `${NS}.saveBase64ToFile`;
const CH_GET_CONFIG = `${NS}.getConfig`;

// ---------------------------------------------------------------------------
// 配置存储：优先用 QwQNT 提供的 configs 目录，兜底到 Electron userData / cwd。
// ---------------------------------------------------------------------------
function getConfigDir() {
  try {
    if (typeof qwqnt !== "undefined" && qwqnt?.framework?.paths?.configs) {
      return qwqnt.framework.paths.configs;
    }
  } catch {
    /* 非 QwQNT 环境 */
  }
  try {
    const { app } = require("electron");
    return app.getPath("userData");
  } catch {
    return process.cwd();
  }
}

// 配置放在插件专属子目录内，避免与其它插件混在 configs 根目录
const configDir = path.join(getConfigDir(), "qwqnt-message-to-image");
const configPath = path.join(configDir, "config.json");

// 默认配置（首次运行会写出此文件供手动编辑）
const defaultConfig = {
  // 渲染倍率：图片分辨率放大倍数。1=原始，2=高清，可填 3、4 等更高值
  scale: 2,
  // 固定保存目录：留空则每次弹出保存对话框；填写绝对路径则直接保存到该目录
  savePath: "",
};

// 只保留已知字段并补齐缺失项，顺带丢弃废弃字段（如旧版 highResolution）
function normalizeConfig(raw) {
  const src = raw || {};
  const cfg = { scale: defaultConfig.scale, savePath: defaultConfig.savePath };
  // 倍率合法性校验：数字且 > 0，否则回退默认
  const n = Number(src.scale);
  cfg.scale = Number.isFinite(n) && n > 0 ? n : defaultConfig.scale;
  cfg.savePath = typeof src.savePath === "string" ? src.savePath : "";
  return cfg;
}

function loadConfig() {
  try {
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      const cfg = normalizeConfig(raw);
      // 旧文件缺字段或含废弃字段时，回写升级到最新结构
      if (JSON.stringify(raw) !== JSON.stringify(cfg)) {
        writeConfigFile(cfg);
      }
      return cfg;
    }
    // 首次运行：写出默认配置文件
    writeConfigFile(defaultConfig);
  } catch (err) {
    console.error("[消息转图片] 读取配置失败", err);
  }
  return { ...defaultConfig };
}

function writeConfigFile(cfg) {
  try {
    const dir = path.dirname(configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
  } catch (err) {
    console.error("[消息转图片] 写入配置失败", err);
  }
}

let config = loadConfig();

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
// 渲染进程每次转图片前拉取最新配置（支持编辑 JSON 后无需重启，重新右键即可生效）
ipcMain.handle(CH_GET_CONFIG, () => {
  config = loadConfig();
  return config;
});

ipcMain.on(`${NS}.log`, (_event, ...args) => {
  console.log("[消息转图片][渲染]", ...args);
});

ipcMain.on(CH_SAVE, async (_event, fileName, base64) => {
  try {
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

console.log("[消息转图片] main 已加载，配置路径:", configPath);
