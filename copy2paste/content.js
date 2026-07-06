// This file only *defines* window.__c2pStart; it never runs on its own.
// The background worker injects this file first (making the function
// available in the page's isolated world), then calls it separately with
// the desired mode ("text" or "image"). Re-injecting this file is safe and
// cheap \u2014 it just redefines the same function.
(() => {
  const BLOCK_TAGS = new Set([
    "DIV", "P", "LI", "TD", "TH", "TR", "UL", "OL",
    "H1", "H2", "H3", "H4", "H5", "H6",
    "SECTION", "ARTICLE", "HEADER", "FOOTER",
    "BLOCKQUOTE", "PRE", "TABLE", "FORM", "MAIN"
  ]);

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
        : "Drag over text to copy it \u00b7 Esc to cancel";

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
      const text = extractTextInArea(selRect);
      if (!text) {
        showToastThenCleanup("No text found in that area");
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showToastThenCleanup("Copied to clipboard!");
      } catch (err) {
        console.error("Copy2Paste failed:", err);
        showToastThenCleanup("Couldn't copy \u2014 see console for details");
      }
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
      // Hide our own UI so it isn't included in the screenshot.
      overlay.style.visibility = "hidden";
      rectEl.style.visibility = "hidden";
      hint.style.visibility = "hidden";

      // Let the browser actually repaint without our overlay before capturing.
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

    function captureVisibleTab() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "C2P_CAPTURE_VISIBLE_TAB" }, (response) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response?.error) return reject(new Error(response.error));
          resolve(response.dataUrl);
        });
      });
    }

    function cropToBlob(dataUrl, rect) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // captureVisibleTab returns a screenshot at device pixel resolution,
          // but our rect coordinates are in CSS pixels, so scale accordingly.
          const scale = img.width / window.innerWidth;
          const canvas = document.createElement("canvas");
          canvas.width = rect.width * scale;
          canvas.height = rect.height * scale;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(
            img,
            rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale,
            0, 0, canvas.width, canvas.height
          );
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
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
})();
