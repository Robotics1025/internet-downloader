import { useState, useEffect, useCallback, useRef } from 'react';
import { api, connectProgressWS } from '../api';
import type { Download, ProgressSnapshot } from '../types';

export function useDownloads() {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchDownloads = useCallback(async () => {
    try {
      const data = await api.listDownloads();
      setDownloads(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch downloads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDownloads();

    // Connect WebSocket for live progress
    const ws = connectProgressWS((snap) => {
      setProgress((prev) => ({ ...prev, [snap.download_id]: snap }));
      // When a download completes/fails, refresh the list to get updated DB state
      if (snap.status === 'completed' || snap.status === 'failed') {
        fetchDownloads();
      }
    });
    wsRef.current = ws;

    // Poll every 3s as fallback
    const poll = setInterval(fetchDownloads, 3000);

    return () => {
      ws.close();
      clearInterval(poll);
    };
  }, [fetchDownloads]);

  const startDownload = useCallback(async (id: string) => {
    const updated = await api.startDownload(id);
    setDownloads((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, []);

  const addDownload = useCallback(async (url: string, savePath: string, category = 'general') => {
    const created = await api.addDownload({ url, save_path: savePath, category });
    setDownloads((prev) => [created, ...prev]);
    return created;
  }, []);

  return { downloads, progress, loading, error, startDownload, addDownload, refresh: fetchDownloads };
}
