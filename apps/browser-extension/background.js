// Service worker for DownloadMgr Bridge.
//
// Talks to the local desktop API on 127.0.0.1. The default port is 6543, but
// the packaged AppImage falls back to an OS-assigned port when 6543 is busy
// (e.g. another instance running). We scan a small range and cache the live
// port for a short window so subsequent calls are fast.
//
// All UI surfaces (popup, content-script overlay, context menu) post messages
// here so there is a single place that knows how to call the API.

// Primary range: 6543–6552. The API tries these in order on startup, so this
// is where it ends up 99% of the time.
const PRIMARY_PORT_RANGE = [6543, 6544, 6545, 6546, 6547, 6548, 6549, 6550, 6551, 6552];
const DISCOVERY_CACHE_TTL_MS = 30_000;
const STORAGE_KEY_PORT = "dm_last_known_port";

let _cachedPort = null;
let _cachedAt = 0;

async function _probePort(port, timeoutMs = 600) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: "GET",
      signal: ctrl.signal,
    });
    if (!r.ok) return false;
    const body = await r.json().catch(() => null);
    return !!(body && body.status === "ok");
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function _loadStoredPort() {
  try {
    const got = await chrome.storage.local.get(STORAGE_KEY_PORT);
    const p = got && got[STORAGE_KEY_PORT];
    return typeof p === "number" && p > 0 && p < 65536 ? p : null;
  } catch { return null; }
}

async function _saveStoredPort(port) {
  try { await chrome.storage.local.set({ [STORAGE_KEY_PORT]: port }); } catch {}
}

async function discoverPort() {
  // 1. In-memory cache (fast path within a single SW lifetime).
  if (_cachedPort && Date.now() - _cachedAt < DISCOVERY_CACHE_TTL_MS) {
    if (await _probePort(_cachedPort)) return _cachedPort;
  }
  // 2. Persisted last-known port — covers the case where the API stayed on
  //    the same ephemeral port across SW restarts.
  const stored = await _loadStoredPort();
  if (stored && !PRIMARY_PORT_RANGE.includes(stored)) {
    if (await _probePort(stored)) {
      _cachedPort = stored;
      _cachedAt = Date.now();
      return stored;
    }
  }
  // 3. Primary range — what the API uses by default (it now binds 6543).
  for (const port of PRIMARY_PORT_RANGE) {
    if (await _probePort(port)) {
      _cachedPort = port;
      _cachedAt = Date.now();
      await _saveStoredPort(port);
      return port;
    }
  }
  // Not found on the known range — the app is almost certainly not running.
  // Fail fast with an actionable message (no slow ephemeral scan).
  _cachedPort = null;
  throw new Error(
    "Cannot reach DownloadMgr on 127.0.0.1. Is the desktop app running?",
  );
}

async function apiBase() {
  const port = await discoverPort();
  return `http://127.0.0.1:${port}`;
}

async function sendToApp(url) {
  const base = await apiBase();
  // POST /api/downloads creates the task; auto-categorisation + auto-start
  // happen on the backend, so nothing else is needed from us.
  const res = await fetch(`${base}/api/downloads`, {
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
  await fetch(`${base}/api/downloads/${task.id}/start`, { method: "POST" });
  return task;
}

async function probeMedia(url) {
  const base = await apiBase();
  const res = await fetch(`${base}/api/media/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`probe failed: ${res.status}`);
  return res.json();
}

async function sendMediaToApp(url, formatId, category) {
  const base = await apiBase();
  const res = await fetch(`${base}/api/downloads`, {
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
  await fetch(`${base}/api/downloads/${task.id}/start`, { method: "POST" });
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
      } else if (msg.kind === "health") {
        // Used by the popup to show "Online · vX · N active" without each UI
        // surface needing its own port discovery.
        const base = await apiBase();
        const r = await fetch(`${base}/api/health`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.json();
        sendResponse({ ok: true, base, body });
      } else {
        sendResponse({ ok: false, error: "unknown message kind" });
      }
    } catch (e) {
      const errMsg = e && e.message ? e.message : String(e);
      // Suppress notifications for health pings — the popup already shows the
      // status visually and a desktop toast on every popup open is noisy.
      if (msg.kind !== "health") notify("DownloadMgr error", errMsg, true);
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
