const urlInput = document.getElementById("url");
const sendBtn = document.getElementById("send");
const useCurrentBtn = document.getElementById("useCurrent");
const msgEl = document.getElementById("msg");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");

async function checkHealth() {
  // Delegate port discovery + the health fetch to background.js so we share a
  // single cache of the discovered port across popup + content script.
  const res = await chrome.runtime.sendMessage({ kind: "health" });
  if (res && res.ok) {
    const body = res.body;
    const port = res.base.match(/:(\d+)/)?.[1] ?? "?";
    statusText.textContent =
      `Online · :${port} · v${body.version} · ${body.active_downloads} active`;
    statusEl.classList.remove("bad");
  } else {
    statusText.textContent = "Offline — start the desktop app";
    statusEl.classList.add("bad");
  }
}

async function prefillCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:/.test(tab.url)) urlInput.value = tab.url;
  } catch {
    /* no tabs permission for this page — leave blank */
  }
}

useCurrentBtn.addEventListener("click", prefillCurrentTab);

sendBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) {
    msgEl.className = "msg err";
    msgEl.textContent = "URL is required";
    return;
  }
  sendBtn.disabled = true;
  msgEl.className = "msg";
  msgEl.textContent = "Sending…";
  const res = await chrome.runtime.sendMessage({ kind: "send", url });
  if (res && res.ok) {
    msgEl.className = "msg ok";
    msgEl.textContent = `✓ Sent: ${res.task.file_name}`;
    setTimeout(() => window.close(), 900);
  } else {
    msgEl.className = "msg err";
    msgEl.textContent = (res && res.error) || "failed";
    sendBtn.disabled = false;
  }
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

(async () => {
  await checkHealth();
  await prefillCurrentTab();
  urlInput.focus();
})();
