// 渲染进程：在 QQ 消息右键菜单中注入"转图片"选项。
// 自包含单文件（无相对 import），可作为经典脚本或 ESM 模块被注入。
// 右键菜单注入基于 QQNT 的 DOM 结构，QwQNT / LiteLoaderQQNT 通用。
(function () {
  "use strict";

  const imageIcon = `<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M885.76 204.8v614.4H138.24V204.8h747.52m10.24-71.68H128c-33.93024 0-61.44 27.50976-61.44 61.44v634.88c0 33.93024 27.50976 61.44 61.44 61.44h768c33.93024 0 61.44-27.50976 61.44-61.44V194.56c0-33.93024-27.50976-61.44-61.44-61.44z" fill="currentColor"></path><path d="M256.03584 718.40768a35.81952 35.81952 0 0 1-30.89408-17.6128c-9.91744-16.7424-3.83488-38.46656 12.49792-49.03936l190.45376-123.26912a40.96 40.96 0 0 1 44.08832-0.27136l101.376 63.86176a20.48 20.48 0 0 0 22.36416-0.34816l182.76864-123.20768a35.84512 35.84512 0 0 1 50.36544 10.61888c10.46528 16.59392 4.72576 38.68672-11.54048 49.65376l-209.19296 141.02016a40.94976 40.94976 0 0 1-44.72832 0.6912l-101.95456-64.22528a20.46976 20.46976 0 0 0-22.0416 0.13824l-164.11648 106.22464a35.67104 35.67104 0 0 1-19.44576 5.76512z" fill="currentColor"></path><path d="M337.92 373.76m-51.2 0a51.2 51.2 0 1 0 102.4 0 51.2 51.2 0 1 0-102.4 0Z" fill="currentColor"></path></svg>`;

  // ---------------------------------------------------------------------------
  // canvas 文本自动换行
  // 来自：https://www.zhangxinxu.com/wordpress/2018/02/canvas-text-break-line-letter-spacing-vertical/
  // ---------------------------------------------------------------------------
  CanvasRenderingContext2D.prototype.wrapText = function (text, x, y, maxWidth, lineHeight) {
    if (typeof text != "string" || typeof x != "number" || typeof y != "number") {
      return;
    }
    const context = this;
    const canvas = context.canvas;
    if (typeof maxWidth == "undefined") {
      maxWidth = (canvas && canvas.width) || 300;
    }
    if (typeof lineHeight == "undefined") {
      lineHeight =
        (canvas && parseInt(window.getComputedStyle(canvas).lineHeight)) ||
        parseInt(window.getComputedStyle(document.body).lineHeight);
    }
    const arrText = text.split("");
    let line = "";
    for (let n = 0; n < arrText.length; n++) {
      let testLine = line;
      if (arrText[n] !== "\n") {
        testLine += arrText[n];
      }
      let metrics = context.measureText(testLine);
      let testWidth = metrics.width;
      if ((testWidth > maxWidth && n > 0) || arrText[n] === "\n") {
        context.fillText(line, x, y);
        if (arrText[n] !== "\n") {
          line = arrText[n];
        } else {
          line = "";
        }
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
  };

  // ---------------------------------------------------------------------------
  // 加载头像：优先 fetch→blob→Image（绕开 CORS 污染），失败再直接加载
  // ---------------------------------------------------------------------------
  function imageFromSrc(src, crossOrigin) {
    return new Promise((resolve) => {
      const image = new Image();
      if (crossOrigin) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  async function loadAvatar(config) {
    // 0) 首选：直接用消息 DOM 中已渲染完成的 <img> 元素（无需重新加载）
    const el = config.avatarImg;
    if (el && el.complete && el.naturalWidth > 0) {
      return el;
    }

    const url = config.avatarUrl;
    if (!url) return null;

    // 1) 尝试 fetch 成 blob 再转 objectURL
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const img = await imageFromSrc(objectUrl, false);
        URL.revokeObjectURL(objectUrl);
        if (img) return img;
      }
    } catch {
      /* 回退到直接加载 */
    }
    // 2) 直接加载
    let img = await imageFromSrc(url, false);
    if (img) return img;
    // 3) 带 crossOrigin 再试
    img = await imageFromSrc(url, true);
    if (!img) logMain("头像加载失败:", url);
    return img;
  }

  // ---------------------------------------------------------------------------
  // canvas 绘制消息图片
  // ---------------------------------------------------------------------------
  async function createSticker(config) {
    let zoom = config.scale > 0 ? config.scale : 2;
    const msgBoxMaxWidth = 340;

    const canvasEl = document.createElement("canvas");
    const ctx = canvasEl.getContext("2d");

    const img = await loadAvatar(config);

    // 计算消息气泡尺寸
    ctx.save();
    ctx.font = 14 + "px " + config.fontFamily;
    const contents = config.content.split("\n");
    let width = 0;
    let height = 0;
    for (let i = 0; i < contents.length; i++) {
      const calculateWidth = ctx.measureText(contents[i]).width;
      const tempWidth = calculateWidth <= msgBoxMaxWidth ? calculateWidth : msgBoxMaxWidth;
      width = tempWidth > width ? tempWidth : width;
      height += Math.ceil(calculateWidth / msgBoxMaxWidth + 0.01) * 20;
    }
    ctx.restore();

    let userNameColor = "#999999";
    let msgBoxColor = "#ffffff";
    let contextColor = "#333333";
    if (config.isDark) {
      userNameColor = "#808080";
      msgBoxColor = "#262626";
      contextColor = "#f2f2f2";
    }

    // 测量用户名长度
    ctx.save();
    ctx.font = 12 + "px " + config.fontFamily;
    const userNameWidth = ctx.measureText(config.userName).width + 42 + 4;
    ctx.restore();
    let canWidth = 4 + 32 + 10 + width + 20;
    if (userNameWidth > canWidth) {
      canWidth = userNameWidth;
    }

    canvasEl.width = canWidth * zoom;
    canvasEl.height = (20 + height + 16) * zoom;

    // 圆形头像
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(20 * zoom, 20 * zoom, 16 * zoom, 0, Math.PI * 2, false);
      ctx.clip();
      ctx.drawImage(img, 4 * zoom, 4 * zoom, 32 * zoom, 32 * zoom);
      ctx.restore();
    }

    // 用户名
    ctx.save();
    ctx.font = 12 * zoom + "px " + config.fontFamily;
    ctx.fillStyle = userNameColor;
    ctx.fillText(config.userName, 42 * zoom, 14 * zoom);
    ctx.restore();

    // 气泡框
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(42 * zoom, 20 * zoom, (width + 20) * zoom, (height + 12) * zoom, 8 * zoom);
    ctx.fillStyle = msgBoxColor;
    ctx.fill();
    ctx.restore();

    // 文本
    ctx.save();
    ctx.fillStyle = contextColor;
    ctx.font = 14 * zoom + "px " + config.fontFamily;
    ctx.wrapText(config.content, 52 * zoom, 40 * zoom, width * zoom, 20 * zoom);
    ctx.restore();

    let base64;
    try {
      base64 = canvasEl.toDataURL("image/png", 1);
    } catch (err) {
      // 画布被跨域头像污染，无法导出 → 跳过头像重绘一次
      if (!config._noAvatarRetry) {
        logMain("画布被头像污染，跳过头像重试:", err?.message || String(err));
        return createSticker({ ...config, avatarImg: null, avatarUrl: "", _noAvatarRetry: true });
      }
      logMain("导出失败:", err?.message || String(err));
      return;
    }
    if (window.messageToImage && window.messageToImage.saveBase64ToFile) {
      window.messageToImage.saveBase64ToFile(`${Date.now()}.png`, base64);
    } else {
      console.error("[消息转图片] preload 未注入 window.messageToImage");
    }
  }

  // ---------------------------------------------------------------------------
  // 右键菜单注入
  // ---------------------------------------------------------------------------
  let msgSticker = null;
  let pluginConfig = { scale: 2, savePath: "" };

  async function refreshConfig() {
    if (window.messageToImage?.getConfig) {
      try {
        const cfg = await window.messageToImage.getConfig();
        if (cfg) pluginConfig = cfg;
      } catch {
        /* 用默认值 */
      }
    }
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
    const theme =
      document.body.getAttribute("q-theme") || document.documentElement.getAttribute("q-theme");
    if (theme) {
      return theme.includes("dark");
    }
    const bg = getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/\d+/g);
    if (match && match.length >= 3) {
      const [r, g, b] = match.map(Number);
      return r * 0.299 + g * 0.587 + b * 0.114 < 128;
    }
    return false;
  }

  function logMain(...args) {
    console.log("[消息转图片]", ...args);
    try {
      window.messageToImage?.log?.(...args);
    } catch {
      /* ignore */
    }
  }

  // 从 CSS background-image 中解析 url(...)
  function extractBgUrl(el) {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : "";
  }

  // 判断一个 url 是否像头像
  function looksLikeAvatar(url) {
    return /qlogo\.cn|appavatar|nt_data\/Avatar|\/avatar|头像/i.test(url);
  }

  // 在给定范围内查找头像（<img> 或 background-image），返回 { img, url }
  function findAvatarIn(scope) {
    // 1) 头像容器里的 img
    let el = scope.querySelector(
      ".avatar-span img, .avatar img, img.avatar, .q-avatar img, .message__avatar img, [class*='avatar'] img, [class*='Avatar'] img"
    );
    if (el && el.src) return { img: el, url: el.src };

    // 2) src 像头像的任意 img
    el = Array.from(scope.querySelectorAll("img")).find((img) => looksLikeAvatar(img.src));
    if (el && el.src) return { img: el, url: el.src };

    // 3) 头像容器（class 含 avatar）用了 background-image
    const bgHost = scope.querySelector("[class*='avatar'], [class*='Avatar'], .q-avatar");
    if (bgHost) {
      const url = extractBgUrl(bgHost);
      if (url) return { img: null, url };
    }

    // 4) 扫描范围内所有元素的 background-image，挑出像头像的
    const all = scope.querySelectorAll("*");
    for (const node of all) {
      const url = extractBgUrl(node);
      if (url && looksLikeAvatar(url)) return { img: null, url };
    }
    return { img: null, url: "" };
  }

  function getAvatarImg(messageEl) {
    // 头像通常不在消息气泡内部，而在更外层的消息行容器。向上逐级扩大搜索范围。
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

  document.addEventListener("mouseup", (event) => {
    if (event.button !== 2) {
      msgSticker = null;
      return;
    }
    refreshConfig(); // 右键时拉取最新配置，菜单弹出前通常已返回
    msgSticker = null;
    const messageEl = getParentElement(event.target, "message");
    if (!messageEl) return;

    const msgRecord = messageEl?.__VUE__?.[0]?.props?.msgRecord;
    const elements = msgRecord?.elements;
    if (!elements) return;

    // 仅支持单条纯文本消息
    if (elements.length === 1 && elements[0].textElement) {
      const content = elements[0].textElement.content;
      if (!content) return;
      const userName = msgRecord?.sendMemberName || msgRecord?.sendNickName || "";
      const avatar = getAvatarImg(messageEl);
      const fontFamily = getComputedStyle(messageEl).getPropertyValue("font-family");
      msgSticker = { userName, content, avatarImg: avatar.img, avatarUrl: avatar.url, fontFamily };
    }
  });

  function appendMenuItem(qContextMenu, icon, title, onClick, keepOpen) {
    const template =
      qContextMenu.querySelector(`.q-context-menu-item:not([disabled="true"])`) ||
      document.querySelector(`.q-context-menu-item:not([disabled="true"])`);
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

  new MutationObserver(() => {
    const qContextMenu = document.querySelector(".q-context-menu:not(.message-to-image-injected)");
    if (!qContextMenu) return;
    qContextMenu.classList.add("message-to-image-injected");

    if (msgSticker) {
      const scale = pluginConfig.scale > 0 ? pluginConfig.scale : 2;
      const data = { ...msgSticker, isDark: isDarkTheme(), scale };
      appendMenuItem(qContextMenu, imageIcon, "转图片", () => createSticker(data));
    }
  }).observe(document.body, { childList: true, subtree: true });

  console.log("[消息转图片] renderer 已加载");
})();
