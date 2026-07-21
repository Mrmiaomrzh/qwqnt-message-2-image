# 消息转图片 (qwqnt-message-to-image)

右键单条文本消息，生成 `头像 + 昵称 + 气泡` 样式的图片并保存到本地。

移植自 LiteLoaderQQNT [轻量工具箱 (lite_tools)](https://github.com/xiyuesaves/LiteLoaderQQNT-lite_tools) 的「消息转图片」功能，适配 QwQNT 框架。

## 功能

- 在聊天窗口右键一条**纯文本**消息，菜单中出现「转图片」
- 点击后按 QQ 气泡样式绘制成 PNG
- 自动适配深色 / 浅色主题
- 渲染倍率可调（默认 2 倍，可在配置文件中改为任意倍数）

## 安装

1. 将本文件夹放入 QwQNT 的插件目录
2. 重启 QQ

## 配置

首次运行会自动生成配置文件：

```
<QwQNT configs 目录>/qwqnt-message-to-image/config.json
```

（非 QwQNT 环境回退到 Electron userData 目录。）默认内容：

```json
{
  "scale": 2,
  "savePath": ""
}
```

- **scale**：渲染倍率，图片分辨率放大倍数。`1` = 原始尺寸，`2` = 高清，可填 `3`、`4` 等更高值。非法值自动回退为 `2`。
- **savePath**：固定保存目录。留空则每次转图片弹出保存对话框；填写绝对路径则直接保存到该目录（Windows 路径中的反斜杠需转义，如 `"G:\\images"`）。

修改配置后无需重启，重新右键转图片即可生效（每次右键会重新读取配置文件）。旧版本遗留的配置文件会在加载时自动升级到最新字段结构。

## 目录结构

```
qwqnt-message-to-image/
├── package.json        # QwQNT 清单（qwqnt.inject 声明三个入口）
└── src/
    ├── main.js         # 主进程：保存图片 + JSON 配置读写（标准 Electron IPC）
    ├── preload.js      # 桥接 window.messageToImage.*
    └── renderer.js     # 右键菜单注入 + 消息解析 + canvas 绘制（自包含单文件）
```

> renderer.js 刻意写成无相对 import 的自包含单文件。QwQNT 注入 renderer 时若遇到未打包的相对 `import`，会加载失败导致整个脚本中断（菜单不出现）。如后续用 Vite/electron-vite 打包，可再拆分模块。

## 已知限制

- 仅支持**单条纯文本**消息，不支持图片、表情、@、回复、合并转发等
- QwQNT 原生没有 LiteLoaderQQNT V4 的插件设置页注册接口（`onSettingWindowCreated`），故不提供图形设置界面，改用 JSON 配置文件
- 头像取自消息 DOM 中已渲染的元素（QQNT 用 CSS `background-image` 渲染头像），若头像尚未加载则图中头像位置留空

## 与原版的差异

| 项目 | LiteLoaderQQNT 原版 | 本移植版 |
| --- | --- | --- |
| 清单 | `manifest.json` (`injects`) | `package.json` (`qwqnt.inject`) |
| 头像获取 | `nativeCall` 原生 API + `local:///` | 直接读消息 DOM 中已渲染的头像（`<img>` 或 `background-image`） |
| 存盘通道 | `LiteLoader.lite_tools.*` IPC | 标准 Electron `ipcMain`/`ipcRenderer` |
| 设置界面 | QQ 设置窗口内的插件页 | JSON 配置文件（QwQNT 无设置页注册 API） |
| 倍率 | 固定高清开关（2 倍） | `scale` 任意倍数可调 |
| 深色主题 | 原版注释未启用 | 已启用自动适配 |

## 许可

GPL-3.0（沿用原插件许可）
