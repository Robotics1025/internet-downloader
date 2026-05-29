// Service worker for DownloadMgr Bridge.
//
// Talks to the local desktop API at http://127.0.0.1:6543.
// All UI surfaces (popup, content-script overlay, context menu) post messages
// here so there is a single place that knows how to call the API.

const API_BASE = "http://127.0.0.1:6543";

async function sendToApp(url) {
  // POST /api/downloads creates the task; auto-categorisation + auto-start
  // happen on the backend, so nothing else is needed from us.
  const res = await fetch(`${API_BASE}/api/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  const task = await res.json();
  // Kick off the download immediately.
  await fetch(`${API_BASE}/api/downloads/${task.id}/start`, { method: "POST" });
  return task;
}

async function probeMedia(url) {
  const res = await fetch(`${API_BASE}/api/media/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`probe failed: ${res.status}`);
  return res.json();
}

async function sendMediaToApp(url, formatId, category) {
  const res = await fetch(`${API_BASE}/api/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      file_name: "media.download",
      media_format_id: formatId,
      category: category || "video",
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  const task = await res.json();
  await fetch(`${API_BASE}/api/downloads/${task.id}/start`, { method: "POST" });
  return task;
}

function notify(title, message, isError = false) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message,
    priority: isError ? 2 : 0,
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.kind === "send") {
        const task = await sendToApp(msg.url);
        notify("Sent to DownloadMgr", task.file_name);
        sendResponse({ ok: true, task });
      } else if (msg.kind === "probe") {
        const info = await probeMedia(msg.url);
        sendResponse({ ok: true, info });
      } else if (msg.kind === "sendMedia") {
        const task = await sendMediaToApp(msg.url, msg.formatId, msg.category);
        notify("Sent to DownloadMgr", msg.title || task.file_name);
        sendResponse({ ok: true, task });
      } else {
        sendResponse({ ok: false, error: "unknown message kind" });
      }
    } catch (e) {
      const errMsg = e && e.message ? e.message : String(e);
      notify("DownloadMgr error", errMsg, true);
      sendResponse({ ok: false, error: errMsg });
    }
  })();
  return true; // keep the message channel open for async sendResponse
});

// Right-click → "Send link to DownloadMgr"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "dm-send-link",
    title: "Send link to DownloadMgr",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "dm-send-page",
    title: "Send this page to DownloadMgr",
    contexts: ["page", "video", "audio", "image"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    let url;
    if (info.menuItemId === "dm-send-link") url = info.linkUrl;
    else if (info.menuItemId === "dm-send-page") {
      url = info.srcUrl || info.pageUrl || (tab && tab.url);
    }
    if (!url) return;
    const task = await sendToApp(url);
    notify("Sent to DownloadMgr", task.file_name);
  } catch (e) {
    notify("DownloadMgr error", e.message || String(e), true);
  }
});
