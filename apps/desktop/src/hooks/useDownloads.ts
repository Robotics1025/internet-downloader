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

    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let isCleanedUp = false;

    const connect = () => {
      if (isCleanedUp) return;
      ws = connectProgressWS((snap) => {
        setProgress((prev) => ({ ...prev, [snap.download_id]: snap }));
        if (snap.status === 'completed' || snap.status === 'failed') {
          fetchDownloads();
        }
      });
      
      ws.onclose = () => {
        if (!isCleanedUp) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      wsRef.current = ws;
    };

    connect();

    // Poll every 3s as fallback
    const poll = setInterval(fetchDownloads, 3000);

    return () => {
      isCleanedUp = true;
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      clearInterval(poll);
    };
  }, [fetchDownloads]);

  const startDownload = useCallback(async (id: string) => {
    const updated = await api.startDownload(id);
    setDownloads((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, []);

  const deleteDownload = useCallback(async (id: string) => {
    await api.deleteDownload(id);
    setDownloads((prev) => prev.filter((d) => d.id !== id));
    setProgress((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const addDownload = useCallback(
    async (
      url: string,
      savePath: string,
      category = 'general',
      extras?: { file_name?: string; media_format_id?: string },
    ) => {
      const isPlaylist = url.includes('/playlist?list=') || url.includes('&list=');
      if (isPlaylist && !extras?.media_format_id) {
        const createdList = await api.addPlaylistDownload({ url, save_path: savePath, category });
        setDownloads((prev) => [...createdList, ...prev]);
        createdList.forEach(d => {
          api.startDownload(d.id).then(started => {
            setDownloads((prev) => prev.map((item) => (item.id === started.id ? started : item)));
          }).catch(() => {});
        });
        return createdList[0];
      }

      const created = await api.addDownload({
        url,
        save_path: savePath,
        category,
        ...(extras?.file_name ? { file_name: extras.file_name } : {}),
        ...(extras?.media_format_id ? { media_format_id: extras.media_format_id } : {}),
      });
      setDownloads((prev) => [created, ...prev]);
      // Auto-start: kick off the download immediately so the user doesn't have
      // to click Start. Surface start errors but keep the created task in the list.
      try {
        const started = await api.startDownload(created.id);
        setDownloads((prev) => prev.map((d) => (d.id === started.id ? started : d)));
        return started;
      } catch {
        return created;
      }
    },
    [],
  );

  return {
    downloads,
    progress,
    loading,
    error,
    startDownload,
    addDownload,
    deleteDownload,
    refresh: fetchDownloads,
  };
}
