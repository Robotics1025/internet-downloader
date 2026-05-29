import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { MediaProbeResult } from '../types';

interface AddDownloadDialogProps {
  onAdd: (
    url: string,
    savePath: string,
    category: string,
    extras?: { file_name?: string; media_format_id?: string },
  ) => Promise<unknown>;
  onClose: () => void;
}

const STREAMING_HOST_RE =
  /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|twitch\.tv|dailymotion\.com|soundcloud\.com|reddit\.com)/i;

function looksLikeStreamingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return STREAMING_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

function looksLikePlaylistUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // YouTube: ?list=... (also &list=)  or  /playlist?list=...
    if (/youtube\.com|youtu\.be/i.test(u.hostname)) {
      return u.searchParams.has('list');
    }
    return false;
  } catch {
    return false;
  }
}

function formatBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function formatDuration(s: number | null): string {
  if (s == null) return '';
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

interface QualityChoice {
  label: string;
  sub: string;
  format_id: string;
  size: number | null;
  kind: 'video' | 'audio' | 'best';
}

function buildChoices(probe: MediaProbeResult): QualityChoice[] {
  const out: QualityChoice[] = [
    {
      label: 'Best available',
      sub: 'auto · video + audio · merged',
      format_id: 'bv*+ba/best',
      size: null,
      kind: 'best',
    },
  ];

  const videoFormats = probe.formats
    .filter((f) => f.has_video && f.height)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const seenHeights = new Set<number>();
  for (const f of videoFormats) {
    const h = f.height!;
    if (seenHeights.has(h)) continue;
    seenHeights.add(h);
    out.push({
      label: `${h}p${f.fps && f.fps >= 50 ? Math.round(f.fps) : ''}`,
      sub: `${f.ext.toUpperCase()} · ${f.vcodec?.split('.')[0] ?? ''}${f.has_audio ? ' · with audio' : ' · +audio merged'}`,
      format_id: f.has_audio ? f.format_id : `${f.format_id}+bestaudio`,
      size: f.filesize,
      kind: 'video',
    });
  }

  const audioOnly = probe.formats
    .filter((f) => !f.has_video && f.has_audio)
    .sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))[0];
  if (audioOnly) {
    out.push({
      label: 'Audio only',
      sub: `${audioOnly.ext.toUpperCase()} · ${audioOnly.acodec?.split('.')[0] ?? ''}${
        audioOnly.tbr ? ` · ${Math.round(audioOnly.tbr)} kbps` : ''
      }`,
      format_id: audioOnly.format_id,
      size: audioOnly.filesize,
      kind: 'audio',
    });
  }

  return out;
}

export function AddDownloadDialog({ onAdd, onClose }: AddDownloadDialogProps) {
  const [url, setUrl] = useState('');
  const [savePath, setSavePath] = useState('');
  const [category, setCategory] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<MediaProbeResult | null>(null);
  const [pickedFormat, setPickedFormat] = useState<string | null>(null);
  const probeSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api.getDefaults()
      .then((d) => {
        if (!cancelled) setSavePath((cur) => cur || d.save_path);
      })
      .catch(() => { /* leave blank, user can type */ });
    return () => { cancelled = true; };
  }, []);

  const isPlaylist = looksLikePlaylistUrl(url);

  // Auto-probe when the URL looks like a streaming host. Debounced. Skipped
  // for playlist URLs — those go through the /playlist endpoint, which
  // expands the playlist server-side; running the single-video probe would
  // either hang on a YT radio mix or surface a confusing "Probe failed".
  useEffect(() => {
    const trimmed = url.trim();
    setProbe(null);
    setPickedFormat(null);
    setError('');
    if (!trimmed || !looksLikeStreamingUrl(trimmed) || looksLikePlaylistUrl(trimmed)) {
      setProbing(false);
      return;
    }
    const seq = ++probeSeq.current;
    setProbing(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.probeMedia(trimmed);
        if (seq !== probeSeq.current) return;
        if (res.is_media) {
          setProbe(res);
          setPickedFormat('bv*+ba/best');
          if (res.extractor?.toLowerCase().includes('youtube') || res.formats.some((f) => f.has_video)) {
            setCategory('video');
          }
        } else {
          setProbe(null);
        }
      } catch (e) {
        if (seq !== probeSeq.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        // "Failed to fetch" is the browser's network-level error — almost
        // always "API isn't running". Make the hint actionable.
        const hint = /failed to fetch/i.test(msg)
          ? 'Probe failed: cannot reach the local API. Is the desktop backend running?'
          : `Probe failed: ${msg}`;
        setError(hint);
      } finally {
        if (seq === probeSeq.current) setProbing(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [url]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    setLoading(true);
    setError('');
    try {
      if (probe && pickedFormat) {
        await onAdd(trimmedUrl, savePath.trim(), category, {
          file_name: 'media.download',
          media_format_id: pickedFormat,
        });
      } else {
        await onAdd(trimmedUrl, savePath.trim(), category);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add download');
    } finally {
      setLoading(false);
    }
  }

  const choices = probe ? buildChoices(probe) : [];
  const canSubmit = url.trim().length > 0 && !loading && !probing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl animate-fade-slide flex flex-col"
        style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }}
      >
        <div
          className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <h2 className="text-lg font-bold text-white">Add Download</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
              Paste a direct file URL or a YouTube/streaming link
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: '#64748b' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
              URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://… or https://youtu.be/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
            {probing && (
              <p className="text-xs mt-1.5" style={{ color: '#a5b4fc' }}>
                ⟳ Inspecting stream…
              </p>
            )}
          </div>

          {isPlaylist && (
            <div
              className="rounded-xl p-3 flex items-start gap-3"
              style={{ background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.30)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0"
                style={{ background: 'rgba(168,85,247,0.18)', color: '#d8b4fe' }}
              >
                ▦
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Playlist detected</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#c4b5fd' }}>
                  All videos in this YouTube playlist will be queued. Each gets sorted into its
                  uploader's folder (e.g. <code style={{ color: '#e9d5ff' }}>Videos/Gracie Abrams/…</code>).
                </p>
              </div>
            </div>
          )}

          {probe && (
            <div
              className="rounded-xl p-3"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              <div className="flex gap-3">
                {probe.thumbnail && (
                  <img
                    src={probe.thumbnail}
                    alt=""
                    className="w-20 h-12 rounded-lg object-cover shrink-0"
                    style={{ background: '#0f0f17' }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{probe.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                    {probe.extractor}
                    {probe.duration ? ` · ${formatDuration(probe.duration)}` : ''}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#a5b4fc' }}>
                  Quality
                </label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {choices.map((c) => {
                    const selected = pickedFormat === c.format_id;
                    return (
                      <button
                        key={c.format_id}
                        type="button"
                        onClick={() => {
                          setPickedFormat(c.format_id);
                          setCategory(c.kind === 'audio' ? 'audio' : 'video');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all"
                        style={{
                          background: selected ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${selected ? '#6366f1' : 'transparent'}`,
                        }}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{c.label}</p>
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: '#94a3b8' }}>
                            {c.sub}
                          </p>
                        </div>
                        <span className="text-xs shrink-0 ml-3" style={{ color: '#64748b' }}>
                          {formatBytes(c.size)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>
              Save to
            </label>
            <input
              type="text"
              required
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>

          <p className="text-[11px]" style={{ color: '#64748b' }}>
            Files are auto-sorted by type into <code style={{ color: '#94a3b8' }}>Videos / Music / Documents / Archives / Pictures / Software / Other</code> subfolders.
          </p>

          {error && (
            <div
              className="px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              ⚠ {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#94a3b8',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: !canSubmit ? 'rgba(99,102,241,0.3)' : '#6366f1',
                color: !canSubmit ? '#a5b4fc' : 'white',
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? '⏳ Adding…'
                : isPlaylist
                  ? '⬇ Queue Playlist'
                  : probe
                    ? '⬇ Download Media'
                    : '⬇ Add Download'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
