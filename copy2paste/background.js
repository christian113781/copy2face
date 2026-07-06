// Pages where content scripts can never be injected (Chrome/Edge internal
// pages, extension pages, and the web store). This is the #1 cause of
// "it didn't do anything" on first use \u2014 the freshly-opened
// chrome://extensions tab itself is one of these restricted pages.
const RESTRICTED_URL_PATTERN =
  /^(chrome|edge|about|chrome-extension|extension|moz-extension|devtools):\/\/|^https:\/\/chrome\.google\.com\/webstore|^https:\/\/chromewebstore\.google\.com/i;

const DEFAULT_TITLE =
  "Copy2Paste \u2014 click for options, or use a shortcut (default Alt+0 text / Alt+Shift+0 image)";

// content.js only *defines* window.__c2pStart the first time it's injected;
// calling it again with executeScript's `func` triggers the actual overlay,
// in the same isolated-world `window` the file already ran in.
async function startSelection(tab, mode) {
  if (!tab || !tab.id) return;

  if (!tab.url || RESTRICTED_URL_PATTERN.test(tab.url)) {
    flashWarning(tab.id, "Can't run here \u2014 open a normal webpage");
    return;
  }

  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (m) => {
        if (window.__c2pStart) window.__c2pStart(m);
      },
      args: [mode],
    });
  } catch (err) {
    console.warn("Copy2Paste couldn't start on this page:", err);
    flashWarning(tab.id, "Couldn't start \u2014 try reloading the page");
  }
}

// Puts a red "!" on the toolbar icon for a few seconds with an explanatory
// tooltip, since a page that blocks injection also blocks any in-page
// message from us \u2014 the badge is the only feedback channel left.
function flashWarning(tabId, title) {
  chrome.action.setBadgeText({ text: "!", tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#e74c3c", tabId });
  chrome.action.setTitle({ title, tabId });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "", tabId });
    chrome.action.setTitle({ title: DEFAULT_TITLE, tabId });
  }, 3500);
}

// Kept as a fallback in case default_popup ever fails to open \u2014 normally
// Chrome shows the popup instead of firing this event. Defaults to text mode.
chrome.action.onClicked.addListener((tab) => {
  startSelection(tab, "text");
});

// Keyboard shortcuts: Alt+0 (text) and Alt+Shift+0 (image) by default,
// both user-remappable via chrome://extensions/shortcuts.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-selection-text") startSelection(tab, "text");
  else if (command === "toggle-selection-image") startSelection(tab, "image");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The popup's buttons can't call chrome.scripting against an arbitrary
  // tab as cleanly as the background worker can, so they send the tab id
  // and desired mode here instead.
  if (message?.type === "C2P_START_SELECTION" && message.tabId) {
    chrome.tabs.get(message.tabId, (tab) => {
      if (!chrome.runtime.lastError && tab) startSelection(tab, message.mode || "text");
    });
    return;
  }

  // The content script can't screenshot the tab itself (image mode only),
  // so it asks the background worker to do it, then crops the PNG itself.
  if (message?.type === "C2P_CAPTURE_VISIBLE_TAB") {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // keep the message channel open for the async response
  }
});
