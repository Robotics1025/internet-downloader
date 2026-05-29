// Runs in the PAGE'S JavaScript world (world: "MAIN") at document_start.
// Patches fetch, XHR, video/source src setters, and iframe src so we can
// capture the real video embed URL or HLS/DASH manifest before it reaches
// the player — then postMessage it to the content script.
//
// This is necessary for JavaScript SPAs (Next.js, React, etc.) where the
// video URL is never in the static HTML and yt-dlp can't find it on its own.

(function () {
  'use strict';

  // Known third-party video hosts that yt-dlp has extractors for
  const EMBED_HOST_RE = /streamtape\.com|doodstream\.com|dood\.(to|la|watch|pm|re|yt|cx)|uqload\.(com|co)|fembed\.com|streamsb\.|vidlox\.|mixdrop\.(co|sx)|voe\.sx|upstream\.to|filemoon\.|streamwish\.|vidhide\.|ok\.ru\/video|player\.vimeo\.com|dailymotion\.com\/embed|youtube\.com\/embed|streamlare\.com|gofile\.io|clicknupload|streamhub\.|vidplay\.|megacloud\.|rabbitstream\.|dramacool|asianload|gogoanime/i;
  const HLS_RE     = /\.m3u8(\?|#|$)/i;
  const DASH_RE    = /\.mpd(\?|#|$)/i;
  const VIDEO_RE   = /\.(mp4|webm|mkv|avi|mov|m4v)(\?|#|$)/i;

  const seen = new Set();

  function emit(rawUrl, type) {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    // Resolve relative URLs
    let url = rawUrl;
    try { url = new URL(rawUrl, location.href).href; } catch { return; }
    if (seen.has(url)) return;
    seen.add(url);
    window.postMessage({ __dmgr_capture: true, url, type, ts: Date.now() }, '*');
  }

  /* ── fetch ──────────────────────────────────────────────────────── */
  const _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input) {
      try {
        const url = typeof input === 'string' ? input
          : (input instanceof Request ? input.url : String(input));
        if (HLS_RE.test(url))       emit(url, 'hls');
        else if (DASH_RE.test(url)) emit(url, 'dash');
        else if (VIDEO_RE.test(url)) emit(url, 'video');
        else if (EMBED_HOST_RE.test(url)) emit(url, 'embed');
      } catch {}
      return _fetch.apply(this, arguments);
    };
  }

  /* ── XMLHttpRequest ─────────────────────────────────────────────── */
  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (typeof url === 'string') {
        if (HLS_RE.test(url))        emit(url, 'hls');
        else if (DASH_RE.test(url))  emit(url, 'dash');
        else if (VIDEO_RE.test(url)) emit(url, 'video');
        else if (EMBED_HOST_RE.test(url)) emit(url, 'embed');
      }
    } catch {}
    return _xhrOpen.apply(this, arguments);
  };

  /* ── HTMLMediaElement.src setter ────────────────────────────────── */
  try {
    const mDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (mDesc && mDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        ...mDesc,
        set (val) {
          if (val && !val.startsWith('blob:') && !val.startsWith('data:')) {
            if (HLS_RE.test(val) || DASH_RE.test(val) || VIDEO_RE.test(val)) {
              emit(val, 'video');
            }
          }
          return mDesc.set.call(this, val);
        },
      });
    }
  } catch {}

  /* ── HTMLSourceElement.src setter ───────────────────────────────── */
  try {
    const sDesc = Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src');
    if (sDesc && sDesc.set) {
      Object.defineProperty(HTMLSourceElement.prototype, 'src', {
        ...sDesc,
        set (val) {
          if (val && !val.startsWith('blob:') && !val.startsWith('data:')) {
            if (HLS_RE.test(val) || DASH_RE.test(val) || VIDEO_RE.test(val)) {
              emit(val, 'hls');
            }
          }
          return sDesc.set?.call(this, val);
        },
      });
    }
  } catch {}

  /* ── iframe src: attribute setter + MutationObserver ───────────── */
  function checkIframe (el) {
    if (!el || el.tagName !== 'IFRAME') return;
    const src = el.src || el.getAttribute('src') || '';
    if (src && EMBED_HOST_RE.test(src)) emit(src, 'embed');
  }

  // Patch Element.setAttribute to catch lazy-loaded iframes
  const _setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const result = _setAttr.apply(this, arguments);
    if (name === 'src' && this.tagName === 'IFRAME' && EMBED_HOST_RE.test(value || '')) {
      emit(value, 'embed');
    }
    return result;
  };

  // Watch for dynamically added iframes / video elements
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        checkIframe(node);
        node.querySelectorAll?.('iframe').forEach(checkIframe);
      }
      if (m.type === 'attributes' && m.target.tagName === 'IFRAME' && m.attributeName === 'src') {
        checkIframe(m.target);
      }
    }
  }).observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src'],
  });

  // Scan iframes already in the DOM at injection time
  document.querySelectorAll('iframe').forEach(checkIframe);
})();
