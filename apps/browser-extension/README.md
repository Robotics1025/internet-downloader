# DownloadMgr Bridge — Browser Extension

A small Chrome/Edge/Brave extension that hands URLs to your locally running
DownloadMgr desktop app.

## What it does

- **Overlay button on video sites** — a small `⬇ DownloadMgr` button appears on
  YouTube, Vimeo, Twitch, TikTok, and Dailymotion video pages. Click it, pick a
  quality (1080p / 720p / 360p / Audio only / Best available), and the download
  starts in the desktop app — auto-merged with ffmpeg, auto-saved into the
  `Videos/` (or `Music/`) folder.
- **Toolbar popup** — paste any URL or click "Use current tab" to send it.
- **Right-click context menu** — *Send link to DownloadMgr* on any link,
  *Send this page to DownloadMgr* on any page / `<video>` / `<audio>` / `<img>`.

## Install (developer mode)

The desktop API must be running on `http://127.0.0.1:6543` for the extension
to do anything useful.

1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Choose this directory: `apps/browser-extension/`.

That's it. Pin the extension to the toolbar from the puzzle-piece menu so the
popup is one click away. Open a YouTube video — the overlay button should
appear on the player after a moment.

## Troubleshooting

- **"Cannot reach DownloadMgr at 127.0.0.1:6543"** — start the desktop app
  (`cd apps/api && uv run python -m dm_api.presentation.main`).
- **No overlay button on YouTube** — YouTube replaces the player on
  navigation; reload the page once or wait a second. The extension watches
  for player replacements and re-injects.
- **Popup says "Offline"** — same as the first bullet; verify with
  `curl http://127.0.0.1:6543/api/health`.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, permissions, host matchers |
| `background.js` | Service worker — owns all API calls |
| `content.js` / `content.css` | Overlay button + quality picker injected into video pages |
| `popup.html` / `popup.js` | Toolbar popup |
| `icons/` | 16/48/128 px PNGs |
