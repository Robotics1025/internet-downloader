// Single source of truth for "where does the API live?".
//
// In the packaged Tauri app, the Rust shell parses `DM_PORT <N>` from the
// PyInstaller'd sidecar's stdout and injects the port via an init script before
// React boots. In Vite dev mode no global is set and we fall back to the API's
// default port (6543, see apps/api/src/dm_api/presentation/main.py).

declare global {
  interface Window {
    __DM_API_PORT__?: number;
  }
}

const DEV_FALLBACK_PORT = 6543;

function apiPort(): number {
  return typeof window !== "undefined" && typeof window.__DM_API_PORT__ === "number"
    ? window.__DM_API_PORT__
    : DEV_FALLBACK_PORT;
}

export function getApiBase(): string {
  return `http://127.0.0.1:${apiPort()}`;
}

export function getWsBase(): string {
  return `ws://127.0.0.1:${apiPort()}`;
}
