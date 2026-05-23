import type { Download, AddDownloadPayload, ProgressSnapshot } from './types';

const BASE = 'http://127.0.0.1:6543';
const WS_BASE = 'ws://127.0.0.1:6543';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listDownloads: () => req<Download[]>('GET', '/api/downloads'),
  getDownload: (id: string) => req<Download>('GET', `/api/downloads/${id}`),
  addDownload: (payload: AddDownloadPayload) => req<Download>('POST', '/api/downloads', payload),
  startDownload: (id: string) => req<Download>('POST', `/api/downloads/${id}/start`),
  health: () => req<{ status: string; version: string; active_downloads: number }>('GET', '/api/health'),
};

export function connectProgressWS(onMessage: (snap: ProgressSnapshot) => void): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/progress`);
  ws.onmessage = (evt) => {
    try {
      onMessage(JSON.parse(evt.data) as ProgressSnapshot);
    } catch { /* ignore bad frames */ }
  };
  return ws;
}
