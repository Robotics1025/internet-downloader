// Hover-triggered download button — appears on top of images, videos, and
// file download links (like IDM).
//
// Works with JavaScript SPAs (Next.js, React, etc.) by listening for URLs
// captured by interceptor.js (MAIN world). When the user clicks the button,
// the best captured URL is probed first; location.href is the final fallback.

(function () {
  if (window.__dmgr_injected__) return;
  window.__dmgr_injected__ = true;

  const BTN_ID   = 'dmgr-overlay-btn';
  const PANEL_ID = 'dmgr-overlay-panel';

  const DL_EXT = /\.(zip|exe|dmg|pkg|deb|rpm|tgz|tar\.gz|tar\.bz2|tar\.xz|rar|7z|pdf|mp3|mp4|mkv|avi|mov|flac|wav|ogg|m4a|m4v|webm|iso|apk|msi|appimage|bin|jar|crx|torrent)(\?[^#]*)?$/i;

  // Sites where the page URL IS the canonical media URL yt-dlp wants. For
  // these we skip the intercepted-URL probing step — those captured DASH/HLS
  // chunks would each cost a yt-dlp timeout before failing, while the page
  // URL extracts cleanly on the first attempt.
  const CANONICAL_HOST_RE = /(?:^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|tiktok\.com|dailymotion\.com)$/i;
  function isCanonicalMediaPage(href) {
    try { return CANONICAL_HOST_RE.test(new URL(href).hostname); }
    catch { return false; }
  }

  /* ── intercepted URL store (populated by interceptor.js via postMessage) ─ */
  // Priority order: embed > video > hls/dash
  const captured = { embed: [], video: [], hls: [], dash: [] };
  let captureCount = 0;

  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.__dmgr_capture || !e.data.url) return;
    const { url, type } = e.data;
    const bucket = captured[type];
    if (bucket && !bucket.includes(url)) {
      bucket.push(url);
      captureCount++;
      refreshButtonState();
    }
  });

  function bestCapturedUrl() {
    return captured.embed[0] || captured.video[0] || captured.hls[0] || captured.dash[0] || null;
  }

  /* ── trigger button detection ─────────────────────────────────── */
  // Finds site buttons like "Download Movie", "Watch Now", "Play" that will
  // cause the JS player to load — so we can click them programmatically
  // when the user clicks our button and no stream has been captured yet.

  const TRIGGER_TEXT_RE = /^\s*(download\s*(movie|film|video|now)?|watch\s*(now|movie|film|online|full)?|play\s*(now|movie|film|video)?|stream\s*(now|movie|film)?|مشاهدة|تشغيل)\s*$/i;

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
      s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function findTriggerButton() {
    const candidates = document.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]');
    for (const el of candidates) {
      const text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
      if (TRIGGER_TEXT_RE.test(text) && isVisible(el)) return el;
    }
    return null;
  }

  // Wait until at least one URL is captured or timeout ms pass
  function waitForCapture(timeoutMs = 8000) {
    if (captureCount > 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const start = Date.now();
      const id = setInterval(() => {
        if (captureCount > 0 || Date.now() - start >= timeoutMs) {
          clearInterval(id);
          resolve(captureCount > 0);
        }
      }, 150);
    });
  }

  /* ── target detection ─────────────────────────────────────────── */

  function findTarget(el) {
    let node = el;
    for (let i = 0; i < 5 && node && node !== document.body; i++) {
      if (node.tagName === 'IMG' && node.src && !node.src.startsWith('data:')) {
        const r = node.getBoundingClientRect();
        if (r.width >= 80 && r.height >= 60) return node;
      }
      if (node.tagName === 'VIDEO') return node;
      if (node.tagName === 'A' && node.href && DL_EXT.test(node.href)) return node;
      node = node.parentElement;
    }
    return null;
  }

  /* ── button lifecycle ─────────────────────────────────────────── */

  let activeTarget = null;
  let leaveTimer   = null;

  function removeButton() {
    const b = document.getElementById(BTN_ID);
    if (b) b.remove();
    activeTarget = null;
  }

  // Called whenever captureCount changes to update an already-visible button
  function refreshButtonState() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    if (captureCount > 0) {
      btn.classList.add('dmgr-btn--live');
      btn.title = `Send to DownloadMgr — ${captureCount} stream${captureCount > 1 ? 's' : ''} detected`;
    }
  }

  function showButton(target) {
    if (activeTarget === target && document.getElementById(BTN_ID)) return;
    removeButton();

    const rect = target.getBoundingClientRect();
    const btn  = document.createElement('button');
    btn.id    = BTN_ID;
    btn.type  = 'button';
    if (captureCount > 0) btn.classList.add('dmgr-btn--live');
    btn.title = captureCount > 0
      ? `Send to DownloadMgr — ${captureCount} stream${captureCount > 1 ? 's' : ''} detected`
      : 'Send to DownloadMgr';
    btn.innerHTML = '<span class="dmgr-arrow">⬇</span><span class="dmgr-label">DownloadMgr</span>';
    btn.style.top  = (rect.top  + 10) + 'px';
    btn.style.left = (rect.left + 10) + 'px';

    btn.addEventListener('click', (e) => onButtonClick(e, target));
    btn.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
    btn.addEventListener('mouseleave', () => { leaveTimer = setTimeout(removeButton, 250); });

    document.body.appendChild(btn);
    activeTarget = target;
  }

  /* ── hover delegation ─────────────────────────────────────────── */

  document.addEventListener('mouseover', (e) => {
    const t = findTarget(e.target);
    if (!t) return;
    clearTimeout(leaveTimer);
    showButton(t);
  });

  document.addEventListener('mouseout', (e) => {
    if (!activeTarget) return;
    const t = findTarget(e.target);
    if (t !== activeTarget) return;
    leaveTimer = setTimeout(removeButton, 250);
  });

  /* ── panel helpers ────────────────────────────────────────────── */

  function removePanel() {
    const p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  function showPanel(content, anchorRect) {
    removePanel();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = content;
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(panel);

    const pw = 320;
    const ph = panel.offsetHeight || 220;

    let left = anchorRect.right + 10;
    if (left + pw > window.innerWidth - 8) left = anchorRect.left - pw - 10;
    if (left < 8) left = 8;

    let top = anchorRect.top;
    if (top + ph > window.innerHeight - 8) top = anchorRect.bottom - ph;
    if (top < 8) top = 8;

    panel.style.top  = top  + 'px';
    panel.style.left = left + 'px';

    setTimeout(() => {
      document.addEventListener('click', removePanel, { once: true });
    }, 0);
    return panel;
  }

  /* ── utilities ────────────────────────────────────────────────── */

  function formatBytes(n) {
    if (!n) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
  }

  function buildChoices(info) {
    const out = [
      { label: 'Best available', sub: 'highest quality', format_id: 'bv*+ba/best', size: null, kind: 'best' },
    ];
    const videoFormats = (info.formats || [])
      .filter((f) => f.has_video && f.height)
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    const seen = new Set();
    for (const f of videoFormats) {
      if (seen.has(f.height)) continue;
      seen.add(f.height);
      const fmtId = f.has_audio ? f.format_id : `${f.format_id}+bestaudio`;
      out.push({
        label: `${f.height}p${f.fps && f.fps >= 50 ? Math.round(f.fps) : ''}`,
        sub:   `${(f.ext || '').toUpperCase()}${f.has_audio ? '' : ' · +audio'}`,
        format_id: fmtId, size: f.filesize, kind: 'video',
      });
    }
    // Image formats (Pexels, Flickr, etc.)
    const imageFormats = (info.formats || [])
      .filter((f) => !f.has_video && !f.has_audio && f.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0));
    const seenImg = new Set();
    for (const f of imageFormats) {
      const key = `${f.width}x${f.height}`;
      if (seenImg.has(key)) continue;
      seenImg.add(key);
      out.push({
        label: f.width && f.height ? `${f.width}×${f.height}` : (f.format_note || f.format_id),
        sub: (f.ext || '').toUpperCase(),
        format_id: f.format_id, size: f.filesize, kind: 'image',
      });
    }
    const audioOnly = (info.formats || [])
      .filter((f) => !f.has_video && f.has_audio)
      .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
    if (audioOnly) {
      out.push({
        label: 'Audio only',
        sub: `${(audioOnly.ext || '').toUpperCase()}${audioOnly.tbr ? ` · ${Math.round(audioOnly.tbr)} kbps` : ''}`,
        format_id: audioOnly.format_id, size: audioOnly.filesize, kind: 'audio',
      });
    }
    if (out.length === 2) out.shift(); // drop generic "Best" if only one real choice
    return out;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ── click handler ────────────────────────────────────────────── */

  async function tryProbe(url) {
    try {
      // If the background service worker can't reach the API on any of the
      // discovery ports it returns {ok:false, error:"..."}. We pass the raw
      // response back so the caller can show the error to the user.
      return await chrome.runtime.sendMessage({ kind: 'probe', url });
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'extension message failed' };
    }
  }

  async function onButtonClick(e, target) {
    e.preventDefault();
    e.stopPropagation();
    const rect = target.getBoundingClientRect();
    removeButton();

    // Direct file links (.zip, .exe, etc.) — send immediately
    if (target.tagName === 'A' && DL_EXT.test(target.href)) {
      const panel = showPanel(
        '<div class="dmgr-panel-inner"><div class="dmgr-spinner"></div><div>Sending…</div></div>', rect
      );
      const r = await chrome.runtime.sendMessage({ kind: 'send', url: target.href });
      panel.innerHTML = `<div class="dmgr-panel-inner ${r?.ok ? '' : 'dmgr-err'}">${r?.ok ? '✓ Sent to DownloadMgr' : escapeHtml(r?.error || 'failed')}</div>`;
      setTimeout(removePanel, 1800);
      return;
    }

    const imgSrc = target.tagName === 'IMG' ? target.src : null;
    const onCanonicalHost = isCanonicalMediaPage(location.href);

    const panel = showPanel(
      onCanonicalHost
        ? '<div class="dmgr-panel-inner"><div class="dmgr-spinner"></div><div>Inspecting page…</div></div>'
        : '<div class="dmgr-panel-inner"><div class="dmgr-spinner"></div><div>Inspecting…</div></div>',
      rect,
    );

    let res    = null;
    let usedUrl = null;

    // ── STEP 1: Try already-captured embed/stream URLs first
    //    (Streamtape, DoodStream, HLS manifests, etc.). Skipped on canonical
    //    hosts (YouTube etc.) — those expose dozens of internal DASH chunks
    //    that yt-dlp can't extract from directly, costing a timeout each.
    const capturedList = onCanonicalHost ? [] : [
      ...captured.embed, ...captured.video, ...captured.hls, ...captured.dash,
    ].filter((u, i, a) => a.indexOf(u) === i);

    for (const url of capturedList) {
      const r = await tryProbe(url);
      if (r?.ok && r?.info?.is_media) { res = r; usedUrl = url; break; }
    }

    // ── STEP 2: Try location.href — handles YouTube, Vimeo, Twitch, etc.
    if (!res) {
      if (!onCanonicalHost) {
        panel.innerHTML = `<div class="dmgr-panel-inner"><div class="dmgr-spinner"></div><div>Inspecting page…</div></div>`;
      }
      const r = await tryProbe(location.href);
      if (r?.ok && r?.info?.is_media) { res = r; usedUrl = location.href; }
    }

    // ── STEP 3: Nothing worked yet — auto-click the site's play/download button.
    //    Skipped on canonical hosts: their bare "Download" text matches our
    //    regex and clicking it opens the native YouTube Premium dialog.
    if (!res && !onCanonicalHost) {
      const trigger = findTriggerButton();
      if (trigger) {
        const trigLabel = escapeHtml((trigger.textContent || trigger.value || '').trim().slice(0, 30));
        panel.innerHTML = `<div class="dmgr-panel-inner"><div class="dmgr-spinner"></div><div>Triggering player… <small style="opacity:.7">("${trigLabel}")</small></div></div>`;
        trigger.click();
        const snapshotSize = capturedList.length;
        const found = await waitForCapture(8000);
        if (found) {
          // Only probe URLs that arrived AFTER the trigger click
          const newUrls = [
            ...captured.embed, ...captured.video, ...captured.hls, ...captured.dash,
          ].filter((u, i, a) => a.indexOf(u) === i && !capturedList.includes(u));
          const toTry = newUrls.length ? newUrls : capturedList;
          panel.innerHTML = `<div class="dmgr-panel-inner"><div class="dmgr-spinner"></div><div>Stream found — probing…</div></div>`;
          for (const url of toTry) {
            const r = await tryProbe(url);
            if (r?.ok && r?.info?.is_media) { res = r; usedUrl = url; break; }
          }
          // If probe still failed (e.g. raw HLS without extractor), send directly
          if (!res && toTry.length) {
            const r = await chrome.runtime.sendMessage({ kind: 'send', url: toTry[0] });
            panel.innerHTML = `<div class="dmgr-panel-inner ${r?.ok ? '' : 'dmgr-err'}">${r?.ok ? '✓ Sent to DownloadMgr' : escapeHtml(r?.error || 'failed')}</div>`;
            setTimeout(removePanel, 1800);
            return;
          }
        } else {
          panel.innerHTML = `<div class="dmgr-panel-inner dmgr-err">Player triggered but no stream detected.<br/><small>Site may require login or use DRM encryption.</small></div>`;
          return;
        }
      }
    }

    if (!res?.ok) {
      // Surface the real backend error when present (e.g. "Cannot reach
      // DownloadMgr on 127.0.0.1 ports 6543–6552. Is the desktop app running?")
      // instead of pretending we know which port to suggest.
      if (!res || (res.error && /cannot reach/i.test(res.error))) {
        const detail = (res && res.error) || 'Cannot reach DownloadMgr on 127.0.0.1. Is the desktop app running?';
        panel.innerHTML = `<div class="dmgr-panel-inner dmgr-err">${escapeHtml(detail)}</div>`;
        return;
      }
      if (imgSrc) {
        panel.innerHTML = '<div class="dmgr-panel-inner"><div class="dmgr-spinner"></div><div>Sending image…</div></div>';
        const r = await chrome.runtime.sendMessage({ kind: 'send', url: imgSrc });
        panel.innerHTML = `<div class="dmgr-panel-inner ${r?.ok ? '' : 'dmgr-err'}">${r?.ok ? '✓ Sent to DownloadMgr' : escapeHtml(r?.error || 'failed')}</div>`;
        setTimeout(removePanel, 1800);
      } else {
        panel.innerHTML = `<div class="dmgr-panel-inner dmgr-err">No downloadable media found.<br/><small>Site may require login or use DRM encryption.</small></div>`;
      }
      return;
    }

    // yt-dlp found media — show quality/resolution picker
    const info    = res.info;
    const choices = buildChoices(info);

    panel.innerHTML = `
      <div class="dmgr-panel-inner">
        <div class="dmgr-title">${escapeHtml(info.title || 'media')}</div>
        <div class="dmgr-sub">${escapeHtml(info.extractor || new URL(usedUrl).hostname)}</div>
        <div class="dmgr-choices"></div>
      </div>`;

    const choicesEl = panel.querySelector('.dmgr-choices');
    choices.forEach((c) => {
      const row = document.createElement('button');
      row.type      = 'button';
      row.className = `dmgr-choice${c.kind === 'image' ? ' dmgr-choice--image' : ''}`;
      row.innerHTML = `
        <span class="dmgr-choice-label">${escapeHtml(c.label)}</span>
        <span class="dmgr-choice-sub">${escapeHtml(c.sub)}</span>
        <span class="dmgr-choice-size">${formatBytes(c.size)}</span>`;
      row.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        row.disabled = true;
        const category = c.kind === 'audio' ? 'audio' : c.kind === 'image' ? 'image' : 'video';
        const r = await chrome.runtime.sendMessage({
          kind: 'sendMedia', url: usedUrl,
          formatId: c.format_id,
          category,
          title: info.title,
        });
        if (r?.ok) {
          panel.innerHTML = '<div class="dmgr-panel-inner">✓ Sent to DownloadMgr</div>';
          setTimeout(removePanel, 1500);
        } else {
          panel.innerHTML = `<div class="dmgr-panel-inner dmgr-err">${escapeHtml(r?.error || 'failed')}</div>`;
        }
      });
      choicesEl.appendChild(row);
    });
  }
})();
