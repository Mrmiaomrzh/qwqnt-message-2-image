# 消息转图片 (qwqnt-message-to-image)

右键聊天消息，把 QQ 消息渲染成「头像 + 昵称 + 气泡」样式的 PNG 图片，支持文本、图片、表情、引用消息，以及多选消息批量转图片。  

基于 QwQNT 框架，设置界面依赖 [qwqnt-hako](https://github.com/qwqnt-community/qwqnt-hako)。

原版功能移植自 LiteLoaderQQNT [lite_tools](https://github.com/xiyuesaves/LiteLoaderQQNT-lite_tools)。  

 [LeakDog/qwqnt-message-to-image](https://github.com/LeakDog/qwqnt-message-to-image) — 本项目基于此仓库继续开发，扩展更多支持项。  
## 功能

### 消息类型

| 类型 | 说明 |
| --- | --- |
| 文本 | 多行文本、@（按文本占位）、表情（按名称占位） |
| 图片 | 支持一次多张，纵向排列；本地原图优先，其次缩略图，再退回聊天中已渲染的图 |
| 纯表情 | 大表情包优先读取本地 `staticFacePath`；小黄脸从聊天 DOM 取图；取不到图时显示 `[表情名]` 文字 |
| 引用消息 | 引用块完整展示被引用的原消息（文本原样 / 图片缩略图）；拉取失败时回退摘要文本或 `[图片]` |

### 多选消息转图片

1. 在 QQ 中对消息进行**多选**（勾选一条以上）
2. 点击底部操作栏中注入的「转图片」按钮，或在勾选消息上右键选择「转图片(N)」
3. 保存方式可在设置中选择：
   - **合成长图**：所有勾选消息拼成一张长图
   - **逐条保存**：每条消息独立成图、独立保存，便于单条重截（未设置保存目录时会先弹一次目录选择器）

> 注意：QQ 聊天列表是虚拟列表，**滚出视口的消息无法收集**，多选只截取当前在消息列表里的消息。

### 保存与剪贴板

- **保存目录留空**：每次弹出保存对话框
- **设置了保存目录**：静默保存，不弹任何对话框
- **保存到本地开关**：关闭后不写文件，仅复制
- 生成后按设置自动**复制到剪贴板**，可直接粘贴发送
- 完成后聊天窗口底部弹出结果提示（已复制 / 已保存到某目录 / 已取消）

## 设置

**QQ 主面板 → 设置 → 左侧列表「消息转图片」**（该页由 qwqnt-hako 注入，使用 QQ 原生设置组件）。

所有设置即改即存，无需重启。配置文件由 qwqnt-hako 的 PluginSettings 托管，存放在 QwQNT 框架数据目录的 `configs` 下（以插件 id `qwqnt-message-to-image` 命名的 JSON），一般不需要手动编辑。

可配置项：

| 设置项 | 说明 |
| --- | --- |
| 渲染倍率 | 图片分辨率放大倍数，1x ~ 6x（默认 2x 高清） |
| 多选保存方式 | 合成长图 / 逐条保存（默认合成长图） |
| 复制到剪贴板 | 生成后自动复制到系统剪贴板（默认开启） |
| 保存到本地 | 关闭后仅复制到剪贴板（默认开启） |
| 保存目录 | 留空弹保存对话框；填写绝对路径则静默保存 |
| 重载插件 | 修改插件代码后热重载本插件，新开的窗口使用新代码 |

## 安装

1. 先安装并启用 [qwqnt-hako](https://github.com/qwqnt-community/qwqnt-hako)
2. 将本文件夹放入 QwQNT 的插件目录
3. 重启 QQ

## 使用

在聊天窗口右键一条消息，点击菜单中的「转图片」；多选模式见上文。

## 实现说明

- **渲染管线**：右键时从消息 DOM 的 Vue 属性中提取消息记录（`element.__VUE__`），点击「转图片」后构建离屏消息 DOM（全部内联样式 + data URL 图片），优先用 **SVG foreignObject**（真实浏览器排版）绘制，消息中的大图在排版后按坐标 `drawImage` 合成；被 CSP 拦截时自动回退到 [html2canvas](https://html2canvas.hertzen.com/) 1.4.1（MIT，随插件附带于 `vendor/`）。
- **引用消息**：主进程通过 QQNT 原生 IPC 通道直调 `nodeIKernelMsgService/getMsgsByMsgId`（参考 [QQNT-Toolbox](https://github.com/MeiYongAI/QQNT-Toolbox) 的 fakeEvent 模式）拉取被引用的原消息，多候选 msgId + msgSeq 匹配；失败时依次回退：聊天 DOM 内查找 → 摘要中的本地图片路径 → 摘要文本。
- **多选入口**：检测到含「逐条转发」「合并转发」等原生按钮的底部操作栏时，克隆原生按钮注入「转图片」；勾选状态靠启发式识别（input.checked / aria-checked / class 含 checked|selected）。
- **性能**：首次右键时预热渲染管线；多选解析并行执行；操作栏检测带缓存。
- **开发预览**：`test/preview.html` 用 mock 数据驱动与真实环境相同的渲染管线（stub 掉 preload 桥），本地起静态服务后打开即可目视验收，无需 QQNT 环境。

## 目录结构

```
├── package.json            # qwqnt 插件清单
├── src/main.js             # 主进程：保存图片 / 注入 html2canvas / 原生接口拉消息 / 热重载
├── src/preload.js          # 桥接层（contextBridge）
├── src/renderer.js         # 渲染进程：右键菜单、多选操作栏、离屏渲染、设置页
├── vendor/html2canvas.min.js
└── test/preview.html + preview.js   # 无 QQNT 预览 / 验收页
```

## 已知限制

- 动图（GIF）与动图表情只截取第一帧
- 语音、文件、合并转发、小程序卡片等消息类型不支持
- 多选只截取当前在消息列表里的消息（虚拟列表限制）
- 被引用的原消息拉取失败且无摘要时，引用块显示「[引用消息]」占位
- 图片未下载且聊天未渲染完成时显示「图片加载失败」占位框；表情取不到图时显示 `[表情名]` 文字
- 头像未加载完成时显示昵称首字符占位圆

## 致谢

排名不分先后，感谢以下项目：

- [LeakDog/qwqnt-message-to-image](https://github.com/LeakDog/qwqnt-message-to-image) — 本项目基于此仓库继续开发，扩展更多支持项
- [lite_tools](https://github.com/xiyuesaves/LiteLoaderQQNT-lite_tools) — 原版「消息转图片」功能来源
- [QQNT-Toolbox](https://github.com/MeiYongAI/QQNT-Toolbox) — 多选操作栏注入与 QQNT 原生 IPC 直调（nativeInvoke）的实现参考
- [qwqnt-hako](https://github.com/qwqnt-community/qwqnt-hako) — 设置界面组件与配置读写
- [QwQNT 社区](https://github.com/qwqnt-community) — 插件框架与类型定义
- [html2canvas](https://github.com/niklasvh/html2canvas) — 兜底渲染方案（MIT）

## 许可

GPL-3.0（沿用原插件许可）。`vendor/html2canvas.min.js` 为 MIT 许可的第三方库。
