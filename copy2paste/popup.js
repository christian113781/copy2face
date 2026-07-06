async function startSelection(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.runtime.sendMessage({ type: "C2P_START_SELECTION", tabId: tab.id, mode });
  }
  window.close();
}

document.getElementById("start-text-btn").addEventListener("click", () => startSelection("text"));
document.getElementById("start-image-btn").addEventListener("click", () => startSelection("image"));

document.getElementById("shortcut-btn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById("help-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("help.html") });
  window.close();
});
