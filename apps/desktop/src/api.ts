import type { Download, AddDownloadPayload, ProgressSnapshot, MediaProbeResult } from './types';
import { getApiBase, getWsBase } from './api-port';

export const API_BASE = getApiBase();
export const streamUrl = (id: string) => `${getApiBase()}/api/downloads/${id}/stream`;

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listDownloads: () => req<Download[]>('GET', '/api/downloads'),
  getDownload: (id: string) => req<Download>('GET', `/api/downloads/${id}`),
  addDownload: (payload: AddDownloadPayload) => req<Download>('POST', '/api/downloads', payload),
  addPlaylistDownload: (payload: AddDownloadPayload) => req<Download[]>('POST', '/api/downloads/playlist', payload),
  startDownload: (id: string) => req<Download>('POST', `/api/downloads/${id}/start`),
  pauseDownload: (id: string) => req<Download>('POST', `/api/downloads/${id}/pause`),
  deleteDownload: (id: string, deleteFile = false) => req<void>('DELETE', `/api/downloads/${id}?delete_file=${deleteFile}`),
  revealDownload: (id: string) => req<void>('POST', `/api/downloads/${id}/reveal`),
  openDownload: (id: string) => req<void>('POST', `/api/downloads/${id}/open`),
  cleanupStuck: () => req<{ deleted: number; marked_failed: number }>('POST', '/api/downloads/cleanup'),
  health: () => req<{ status: string; version: string; active_downloads: number }>('GET', '/api/health'),
  probeMedia: (url: string) => req<MediaProbeResult>('POST', '/api/media/probe', { url }),
  getDefaults: () => req<{ save_path: string }>('GET', '/api/config/defaults'),
};

export function connectProgressWS(onMessage: (snap: ProgressSnapshot) => void): WebSocket {
  const ws = new WebSocket(`${getWsBase()}/api/ws/progress`);
  ws.onmessage = (evt) => {
    try {
      onMessage(JSON.parse(evt.data) as ProgressSnapshot);
    } catch { /* ignore bad frames */ }
  };
  return ws;
}
