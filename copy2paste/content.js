// This file only *defines* window.__c2pStart / window.__c2pAnalyzeColors;
// it never runs anything on its own. The background worker injects this
// file first (making the functions available in the page's isolated
// world), then calls one separately. Re-injecting this file is safe and
// cheap \u2014 it just redefines the same functions.
(() => {
  const BLOCK_TAGS = new Set([
    "DIV", "P", "LI", "TD", "TH", "TR", "UL", "OL",
    "H1", "H2", "H3", "H4", "H5", "H6",
    "SECTION", "ARTICLE", "HEADER", "FOOTER",
    "BLOCKQUOTE", "PRE", "TABLE", "FORM", "MAIN"
  ]);

  // ---- Shared helpers (used by both text and image mode) ----

  function captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "C2P_CAPTURE_VISIBLE_TAB" }, (response) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (response?.error) return reject(new Error(response.error));
        resolve(response.dataUrl);
      });
    });
  }

  // rect is in CSS pixels (left/top/width/height); captureVisibleTab
  // returns a screenshot at device pixel resolution, so both crop helpers
  // scale by img.width / window.innerWidth to line them up.
  function cropImage(dataUrl, rect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width / window.innerWidth;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(rect.width * scale));
        canvas.height = Math.max(1, Math.round(rect.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale,
          0, 0, canvas.width, canvas.height
        );
        resolve(canvas);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function cropToBlob(dataUrl, rect) {
    const canvas = await cropImage(dataUrl, rect);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    });
  }

  async function cropToDataUrl(dataUrl, rect) {
    const canvas = await cropImage(dataUrl, rect);
    return canvas.toDataURL("image/png");
  }

  function ensureOffscreenReady() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "C2P_ENSURE_OFFSCREEN" }, (response) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (response && response.ok === false) return reject(new Error(response.error || "Couldn't start OCR"));
        resolve();
      });
    });
  }

  function requestOcr(dataUrl) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "C2P_OCR_IMAGE", dataUrl }, (response) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (response && response.error) return reject(new Error(response.error));
        resolve((response && response.text) || "");
      });
    });
  }

  // ---- Pick a Color (page) ----
  // Uses the same screenshot-and-sample technique as OCR/image mode
  // instead of the browser's native EyeDropper API, since that API's
  // magnifier UI is inconsistent across operating systems (on some it
  // shows no visible preview at all, which looked broken). This version
  // draws its own circle so the preview is guaranteed to show up.
  window.__c2pPickPageColor = async function () {
    if (window.__c2pActive) return;
    window.__c2pActive = true;

    const hint = document.createElement("div");
    hint.id = "c2p-hint";
    hint.textContent = "Capturing the page\u2026";
    document.body.appendChild(hint);

    let canvas, ctx, scale;
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dataUrl = await captureVisibleTab();
      const img = await loadImage(dataUrl);
      scale = img.width / window.innerWidth;
      canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
    } catch (err) {
      console.error("Copy2Paste couldn't capture the page:", err);
      hint.remove();
      window.__c2pActive = false;
      return;
    }

    hint.textContent = "Move to preview a color \u00b7 click to copy \u00b7 Esc to cancel";

    const magnifier = document.createElement("div");
    magnifier.id = "c2p-color-magnifier";
    magnifier.innerHTML = `
      <div class="c2p-color-magnifier-circle"></div>
      <div class="c2p-color-magnifier-hex">\u2013</div>
    `;
    document.body.appendChild(magnifier);
    const circleEl = magnifier.querySelector(".c2p-color-magnifier-circle");
    const hexEl = magnifier.querySelector(".c2p-color-magnifier-hex");

    document.body.classList.add("c2p-color-picking");

    function sampleAt(clientX, clientY) {
      const x = Math.min(canvas.width - 1, Math.max(0, Math.round(clientX * scale)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.round(clientY * scale)));
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    }

    function onMouseMove(e) {
      const hex = sampleAt(e.clientX, e.clientY);
      magnifier.style.left = `${e.clientX}px`;
      magnifier.style.top = `${e.clientY}px`;
      circleEl.style.background = hex;
      hexEl.textContent = hex;
    }

    async function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const hex = sampleAt(e.clientX, e.clientY);
      try {
        await navigator.clipboard.writeText(hex);
        finish(`Copied ${hex}`, hex);
      } catch (err) {
        console.error("Copy2Paste failed:", err);
        finish("Couldn't copy \u2014 see console for details");
      }
    }

    function onKeyDown(e) {
      if (e.key === "Escape") finish();
    }

    function finish(message, hex) {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("c2p-color-picking");
      magnifier.remove();
      hint.remove();
      window.__c2pActive = false;
      if (message) standaloneToast(message, hex);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
  };

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // ---- Text / image drag-selection ----

  window.__c2pStart = function (mode) {
    if (window.__c2pActive) return;
    window.__c2pActive = true;

    const overlay = document.createElement("div");
    overlay.id = "c2p-overlay";

    const rectEl = document.createElement("div");
    rectEl.id = "c2p-rect";

    const hint = document.createElement("div");
    hint.id = "c2p-hint";
    hint.textContent =
      mode === "image"
        ? "Drag to select an area to copy as an image \u00b7 Esc to cancel"
        : "Drag over text to copy it (images/video included) \u00b7 Esc to cancel";

    document.body.appendChild(overlay);
    document.body.appendChild(rectEl);
    document.body.appendChild(hint);

    let startX = 0, startY = 0;
    let dragging = false;

    function cleanup() {
      overlay.remove();
      rectEl.remove();
      hint.remove();
      document.removeEventListener("keydown", onKeyDown);
      window.__c2pActive = false;
    }

    function onKeyDown(e) {
      if (e.key === "Escape") cleanup();
    }
    document.addEventListener("keydown", onKeyDown);

    overlay.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      rectEl.style.display = "block";
      updateRect(e.clientX, e.clientY);
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      updateRect(e.clientX, e.clientY);
    });

    overlay.addEventListener("mouseup", async (e) => {
      if (!dragging) return;
      dragging = false;

      const selRect = {
        left: Math.min(startX, e.clientX),
        top: Math.min(startY, e.clientY),
        right: Math.max(startX, e.clientX),
        bottom: Math.max(startY, e.clientY),
      };

      if (selRect.right - selRect.left < 4 || selRect.bottom - selRect.top < 4) {
        cleanup();
        return;
      }

      if (mode === "image") {
        await handleImageCopy(selRect);
      } else {
        await handleTextCopy(selRect);
      }
    });

    function updateRect(curX, curY) {
      const x = Math.min(startX, curX);
      const y = Math.min(startY, curY);
      const w = Math.abs(curX - startX);
      const h = Math.abs(curY - startY);
      rectEl.style.left = `${x}px`;
      rectEl.style.top = `${y}px`;
      rectEl.style.width = `${w}px`;
      rectEl.style.height = `${h}px`;
    }

    // ---- Text mode ----

    async function handleTextCopy(selRect) {
      const domText = extractTextInArea(selRect);
      const hasImageContent = selectionHasImageContent(selRect);

      if (!hasImageContent) {
        await finishTextCopy(domText);
        return;
      }

      let ocrText = "";
      try {
        ocrText = await ocrArea(selRect);
      } catch (err) {
        // Don't let an OCR failure block copying whatever DOM text we
        // already found \u2014 just proceed without the image text.
        console.error("Copy2Paste OCR failed:", err);
      }

      const combined = [domText, ocrText].filter(Boolean).join("\n\n");
      await finishTextCopy(combined, ocrText ? "Copied text + image text!" : undefined);
    }

    async function finishTextCopy(text, successMessage) {
      if (!text) {
        showToastThenCleanup("No text found in that area");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showToastThenCleanup(successMessage || "Copied to clipboard!");
      } catch (err) {
        console.error("Copy2Paste failed:", err);
        showToastThenCleanup("Couldn't copy \u2014 see console for details");
      }
    }

    // Screenshots just the selected area and runs it through the local
    // OCR engine (offscreen document) to read any text baked into images.
    async function ocrArea(selRect) {
      overlay.style.visibility = "hidden";
      rectEl.style.visibility = "hidden";
      hint.style.visibility = "hidden";
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const dataUrl = await captureVisibleTab();
      const cropDataUrl = await cropToDataUrl(dataUrl, {
        x: selRect.left,
        y: selRect.top,
        width: selRect.right - selRect.left,
        height: selRect.bottom - selRect.top,
      });

      hint.textContent = "Reading text in image\u2026 this can take a few seconds";
      hint.style.visibility = "visible";

      await ensureOffscreenReady();
      return requestOcr(cropDataUrl);
    }

    // Quick check for whether the selection overlaps anything that could
    // contain non-DOM text (a photo, screenshot, banner, etc.) \u2014 used to
    // skip the OCR pass entirely for ordinary text selections, since OCR
    // takes a few seconds and most selections don't need it.
    function selectionHasImageContent(selRect) {
      const elements = document.body.querySelectorAll("*");
      for (const el of elements) {
        if (el.closest("#c2p-overlay, #c2p-rect, #c2p-hint")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const overlaps = r.left < selRect.right && r.right > selRect.left && r.top < selRect.bottom && r.bottom > selRect.top;
        if (!overlaps) continue;

        const tag = el.tagName;
        if (tag === "IMG" || tag === "CANVAS" || tag === "VIDEO" || tag === "svg" || tag === "SVG") return true;

        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") return true;
      }
      return false;
    }

    // Walk every text node in the page, keep the ones that visually overlap
    // the dragged rectangle by a reasonable margin, and stitch them back
    // together in reading order with sensible line breaks.
    function extractTextInArea(selRect) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest("#c2p-overlay, #c2p-rect, #c2p-hint")) return NodeFilter.FILTER_REJECT;
          if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const groups = [];
      let currentBlock = null;
      let currentGroup = null;

      let node;
      while ((node = walker.nextNode())) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        if (!rects.length) continue;

        let ux1 = Infinity, uy1 = Infinity, ux2 = -Infinity, uy2 = -Infinity;
        for (const r of rects) {
          ux1 = Math.min(ux1, r.left);
          uy1 = Math.min(uy1, r.top);
          ux2 = Math.max(ux2, r.right);
          uy2 = Math.max(uy2, r.bottom);
        }
        const nodeArea = Math.max(0, ux2 - ux1) * Math.max(0, uy2 - uy1);
        if (nodeArea === 0) continue;

        const ix1 = Math.max(ux1, selRect.left);
        const iy1 = Math.max(uy1, selRect.top);
        const ix2 = Math.min(ux2, selRect.right);
        const iy2 = Math.min(uy2, selRect.bottom);
        const iw = Math.max(0, ix2 - ix1);
        const ih = Math.max(0, iy2 - iy1);
        const overlapArea = iw * ih;

        if (overlapArea / nodeArea < 0.3) continue;

        const block = getBlockAncestor(node);
        if (block !== currentBlock) {
          currentGroup = { block, parts: [] };
          groups.push(currentGroup);
          currentBlock = block;
        }
        currentGroup.parts.push(node.nodeValue.trim());
      }

      return groups
        .map((g) => g.parts.join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
    }

    function getBlockAncestor(textNode) {
      let el = textNode.parentElement;
      while (el && el !== document.body && !BLOCK_TAGS.has(el.tagName)) {
        el = el.parentElement;
      }
      return el || document.body;
    }

    // ---- Image mode ----

    async function handleImageCopy(selRect) {
      overlay.style.visibility = "hidden";
      rectEl.style.visibility = "hidden";
      hint.style.visibility = "hidden";
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      try {
        const dataUrl = await captureVisibleTab();
        const blob = await cropToBlob(dataUrl, {
          x: selRect.left,
          y: selRect.top,
          width: selRect.right - selRect.left,
          height: selRect.bottom - selRect.top,
        });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToastThenCleanup("Copied image to clipboard!");
      } catch (err) {
        console.error("Copy2Paste failed:", err);
        showToastThenCleanup("Couldn't copy \u2014 see console for details");
      }
    }

    // ---- Shared UI ----

    function showToastThenCleanup(message) {
      const toast = document.createElement("div");
      toast.id = "c2p-toast";
      toast.textContent = message;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add("c2p-show"));
      setTimeout(() => {
        toast.classList.remove("c2p-show");
        setTimeout(() => {
          toast.remove();
          cleanup();
        }, 200);
      }, 1200);
    }
  };

  // ---- Webpage Color Analyzer (ColorZilla-style) ----
  // Unlike __c2pStart, this doesn't need a drag selection: it scans the
  // whole rendered page immediately and shows a results panel.
  window.__c2pAnalyzeColors = function () {
    const existing = document.getElementById("c2p-color-panel");
    if (existing) {
      existing.remove();
      return;
    }

    const counts = new Map(); // rgb string -> count

    function record(value) {
      if (!value) return;
      if (value === "transparent" || value.startsWith("rgba(0, 0, 0, 0)")) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    }

    const all = document.querySelectorAll("body, body *");
    for (const el of all) {
      if (el.closest("#c2p-color-panel, #c2p-overlay, #c2p-rect, #c2p-hint, #c2p-toast")) continue;
      const cs = getComputedStyle(el);
      record(cs.backgroundColor);
      record(cs.color);
      if (parseFloat(cs.borderTopWidth) > 0) record(cs.borderTopColor);
    }

    const swatches = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([rgb, count]) => ({ rgb, hex: rgbToHex(rgb), count }))
      .filter((s) => s.hex);

    const panel = document.createElement("div");
    panel.id = "c2p-color-panel";

    const header = document.createElement("div");
    header.id = "c2p-color-panel-header";
    header.innerHTML = `<span>Webpage Color Analyzer</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.id = "c2p-color-panel-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", () => panel.remove());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const sub = document.createElement("div");
    sub.id = "c2p-color-panel-sub";
    sub.textContent = `${swatches.length} colors found \u00b7 click any swatch to copy its hex`;
    panel.appendChild(sub);

    const grid = document.createElement("div");
    grid.id = "c2p-color-grid";
    for (const s of swatches) {
      const item = document.createElement("button");
      item.className = "c2p-swatch";
      item.title = `${s.hex} \u00b7 used ${s.count}\u00d7`;
      item.innerHTML = `
        <span class="c2p-swatch-color" style="background:${s.hex}"></span>
        <span class="c2p-swatch-hex">${s.hex}</span>
      `;
      item.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(s.hex);
          standaloneToast(`Copied ${s.hex}`);
        } catch (err) {
          console.error("Copy2Paste failed:", err);
          standaloneToast("Couldn't copy that color");
        }
      });
      grid.appendChild(item);
    }
    panel.appendChild(grid);

    document.body.appendChild(panel);

    function onKeyDown(e) {
      if (e.key === "Escape") {
        panel.remove();
        document.removeEventListener("keydown", onKeyDown);
      }
    }
    document.addEventListener("keydown", onKeyDown);
  };

  function rgbToHex(rgb) {
    const m = rgb.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((v) => parseFloat(v.trim()));
    const [r, g, b, a = 1] = parts;
    if (a === 0) return null;
    const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // A minimal toast for actions that don't run inside __c2pStart's overlay
  // lifecycle (e.g. copying a swatch from the color panel, which should
  // stay open after the copy instead of being torn down).
  function standaloneToast(message, colorHex) {
    const toast = document.createElement("div");
    toast.id = "c2p-toast";
    if (colorHex) {
      const swatch = document.createElement("span");
      swatch.className = "c2p-toast-swatch";
      swatch.style.background = colorHex;
      toast.appendChild(swatch);
    }
    const label = document.createElement("span");
    label.textContent = message;
    toast.appendChild(label);
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("c2p-show"));
    setTimeout(() => {
      toast.classList.remove("c2p-show");
      setTimeout(() => toast.remove(), 200);
    }, 1200);
  }
})();
