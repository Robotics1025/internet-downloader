import { useEffect, useRef, useState } from 'react';
import { X, Clipboard, Star, Music } from 'lucide-react';
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
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Quick-action pill state (v1: visual only for quality/audio hints)
  const [qualityHint, setQualityHint] = useState<'best' | 'audio' | null>(null);

  // Focus the URL input when dialog mounts
  useEffect(() => {
    urlInputRef.current?.focus();
  }, []);

  // Load defaults
  useEffect(() => {
    let cancelled = false;
    api.getDefaults()
      .then((d) => {
        if (!cancelled) setSavePath((cur) => cur || d.save_path);
      })
      .catch(() => { /* leave blank, user can type */ });
    return () => { cancelled = true; };
  }, []);

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isPlaylist = looksLikePlaylistUrl(url);

  // Auto-probe debounced
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

    // Resolve effective format: quality hint pills can override
    let effectiveFormat = pickedFormat;
    if (probe && qualityHint === 'audio') {
      const audioChoice = buildChoices(probe).find((c) => c.kind === 'audio');
      if (audioChoice) effectiveFormat = audioChoice.format_id;
    } else if (probe && qualityHint === 'best') {
      effectiveFormat = 'bv*+ba/best';
    }

    try {
      if (probe && effectiveFormat) {
        await onAdd(trimmedUrl, savePath.trim(), category, {
          file_name: 'media.download',
          media_format_id: effectiveFormat,
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

  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // Permission denied — do nothing
    }
  }

  function handleBestQuality() {
    setQualityHint('best');
    if (probe) {
      setPickedFormat('bv*+ba/best');
      setCategory('video');
    }
  }

  function handleAudioOnly() {
    setQualityHint('audio');
    if (probe) {
      const audioChoice = buildChoices(probe).find((c) => c.kind === 'audio');
      if (audioChoice) {
        setPickedFormat(audioChoice.format_id);
        setCategory('audio');
      }
    }
  }

  const choices = probe ? buildChoices(probe) : [];
  const canSubmit = url.trim().length > 0 && !loading && !probing;

  return (
    <>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes dm-dialog-in {
          from { opacity: 0; transform: scale(0.97) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes dm-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .dm-dialog-overlay {
          animation: dm-overlay-in var(--dm-duration-fast) var(--dm-easing-out) both;
        }
        .dm-dialog-card {
          animation: dm-dialog-in var(--dm-duration-fast) var(--dm-easing-out) both;
        }
        .dm-url-input:focus {
          border-color: var(--dm-color-border-focus) !important;
          outline: 2px solid var(--dm-color-accent-subtle);
          outline-offset: 0px;
        }
        .dm-pill-btn:hover {
          background: var(--dm-color-bg-hover) !important;
          color: var(--dm-color-fg-primary) !important;
        }
        .dm-cancel-btn:hover {
          background: var(--dm-color-bg-hover) !important;
          color: var(--dm-color-fg-primary) !important;
        }
        .dm-quality-row::-webkit-scrollbar { width: 4px; }
        .dm-quality-row::-webkit-scrollbar-track { background: transparent; }
        .dm-quality-row::-webkit-scrollbar-thumb { background: var(--dm-color-border-default); border-radius: 2px; }
      `}</style>

      {/* Overlay */}
      <div
        className="dm-dialog-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          background: 'rgba(0,0,0,.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div
          className="dm-dialog-card"
          style={{
            width: '100%',
            maxWidth: '520px',
            maxHeight: '80vh',
            background: 'var(--dm-color-bg-elevated)',
            border: '1px solid var(--dm-color-border-subtle)',
            borderRadius: 'var(--dm-radius-lg)',
            padding: '24px',
            boxShadow: '0 24px 48px rgba(0,0,0,.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
            <span
              style={{
                fontSize: 'var(--dm-text-lg)',
                fontWeight: 'var(--dm-weight-semibold)',
                color: 'var(--dm-color-fg-primary)',
                lineHeight: 'var(--dm-leading-tight)',
              }}
            >
              Add Download
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--dm-radius-md)',
                border: 'none',
                background: 'transparent',
                color: 'var(--dm-color-fg-tertiary)',
                cursor: 'pointer',
                transition: 'background var(--dm-duration-fast) ease, color var(--dm-duration-fast) ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--dm-color-bg-hover)';
                e.currentTarget.style.color = 'var(--dm-color-fg-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--dm-color-fg-tertiary)';
              }}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>

          {/* Scrollable form body */}
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', flex: 1 }}
          >
            {/* URL field */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--dm-text-xs)',
                  fontWeight: 'var(--dm-weight-medium)',
                  color: 'var(--dm-color-fg-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--dm-tracking-wide)',
                  marginBottom: '6px',
                }}
              >
                URL
              </label>
              <input
                ref={urlInputRef}
                type="url"
                required
                placeholder="https://… or https://youtu.be/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="dm-url-input"
                style={{
                  width: '100%',
                  height: '40px',
                  background: 'var(--dm-color-bg-recessed)',
                  border: '1px solid var(--dm-color-border-default)',
                  borderRadius: 'var(--dm-radius-md)',
                  padding: '0 12px',
                  fontSize: 'var(--dm-text-sm)',
                  color: 'var(--dm-color-fg-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color var(--dm-duration-fast) ease',
                }}
              />
              {probing && (
                <p style={{ fontSize: 'var(--dm-text-xs)', color: 'var(--dm-color-status-info-text)', marginTop: '6px' }}>
                  Inspecting stream…
                </p>
              )}
            </div>

            {/* Quick-action pills */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="dm-pill-btn"
                onClick={handlePasteFromClipboard}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--dm-color-bg-recessed)',
                  border: '1px solid var(--dm-color-border-subtle)',
                  borderRadius: 'var(--dm-radius-full)',
                  padding: '6px 12px',
                  fontSize: 'var(--dm-text-xs)',
                  fontWeight: 'var(--dm-weight-medium)',
                  color: 'var(--dm-color-fg-secondary)',
                  cursor: 'pointer',
                  transition: 'background var(--dm-duration-fast) ease, color var(--dm-duration-fast) ease',
                }}
              >
                <Clipboard size={11} strokeWidth={2} />
                Paste from clipboard
              </button>
              <button
                type="button"
                className="dm-pill-btn"
                onClick={handleBestQuality}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: qualityHint === 'best'
                    ? 'var(--dm-color-accent-subtle)'
                    : 'var(--dm-color-bg-recessed)',
                  border: `1px solid ${qualityHint === 'best' ? 'var(--dm-color-accent-primary)' : 'var(--dm-color-border-subtle)'}`,
                  borderRadius: 'var(--dm-radius-full)',
                  padding: '6px 12px',
                  fontSize: 'var(--dm-text-xs)',
                  fontWeight: 'var(--dm-weight-medium)',
                  color: qualityHint === 'best'
                    ? 'var(--dm-color-accent-primary)'
                    : 'var(--dm-color-fg-secondary)',
                  cursor: 'pointer',
                  transition: 'background var(--dm-duration-fast) ease, color var(--dm-duration-fast) ease, border-color var(--dm-duration-fast) ease',
                }}
              >
                <Star size={11} strokeWidth={2} />
                Best quality
              </button>
              <button
                type="button"
                className="dm-pill-btn"
                onClick={handleAudioOnly}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: qualityHint === 'audio'
                    ? 'var(--dm-color-accent-subtle)'
                    : 'var(--dm-color-bg-recessed)',
                  border: `1px solid ${qualityHint === 'audio' ? 'var(--dm-color-accent-primary)' : 'var(--dm-color-border-subtle)'}`,
                  borderRadius: 'var(--dm-radius-full)',
                  padding: '6px 12px',
                  fontSize: 'var(--dm-text-xs)',
                  fontWeight: 'var(--dm-weight-medium)',
                  color: qualityHint === 'audio'
                    ? 'var(--dm-color-accent-primary)'
                    : 'var(--dm-color-fg-secondary)',
                  cursor: 'pointer',
                  transition: 'background var(--dm-duration-fast) ease, color var(--dm-duration-fast) ease, border-color var(--dm-duration-fast) ease',
                }}
              >
                <Music size={11} strokeWidth={2} />
                Audio only
              </button>
            </div>

            {/* Playlist notice */}
            {isPlaylist && (
              <div
                style={{
                  marginTop: '16px',
                  borderRadius: 'var(--dm-radius-md)',
                  padding: '12px',
                  background: 'rgba(168,85,247,0.10)',
                  border: '1px solid rgba(168,85,247,0.30)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--dm-radius-sm)',
                    background: 'rgba(168,85,247,0.18)',
                    color: '#d8b4fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    flexShrink: 0,
                  }}
                >
                  ▦
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--dm-text-sm)', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-fg-primary)', margin: 0 }}>
                    Playlist detected
                  </p>
                  <p style={{ fontSize: '11px', color: '#c4b5fd', marginTop: '2px', margin: 0 }}>
                    All videos in this YouTube playlist will be queued. Each gets sorted into its uploader's folder.
                  </p>
                </div>
              </div>
            )}

            {/* Probe result + quality picker */}
            {probe && (
              <div
                style={{
                  marginTop: '16px',
                  borderRadius: 'var(--dm-radius-md)',
                  padding: '12px',
                  background: 'var(--dm-color-accent-subtle)',
                  border: '1px solid var(--dm-color-border-focus)',
                }}
              >
                <div style={{ display: 'flex', gap: '12px' }}>
                  {probe.thumbnail && (
                    <img
                      src={probe.thumbnail}
                      alt=""
                      style={{ width: '80px', height: '48px', borderRadius: 'var(--dm-radius-sm)', objectFit: 'cover', flexShrink: 0, background: 'var(--dm-color-bg-recessed)' }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 'var(--dm-text-sm)', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-fg-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {probe.title}
                    </p>
                    <p style={{ fontSize: 'var(--dm-text-xs)', color: 'var(--dm-color-fg-secondary)', margin: '2px 0 0 0' }}>
                      {probe.extractor}{probe.duration ? ` · ${formatDuration(probe.duration)}` : ''}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: 'var(--dm-text-xs)', fontWeight: 'var(--dm-weight-medium)', color: 'var(--dm-color-fg-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--dm-tracking-wide)', marginBottom: '6px' }}>
                    Quality
                  </label>
                  <div className="dm-quality-row" style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
                    {choices.map((c) => {
                      const selected = pickedFormat === c.format_id;
                      return (
                        <button
                          key={c.format_id}
                          type="button"
                          onClick={() => {
                            setPickedFormat(c.format_id);
                            setCategory(c.kind === 'audio' ? 'audio' : 'video');
                            setQualityHint(null);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: 'var(--dm-radius-sm)',
                            border: `1px solid ${selected ? 'var(--dm-color-border-focus)' : 'transparent'}`,
                            background: selected ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.03)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background var(--dm-duration-fast) ease',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 'var(--dm-text-sm)', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-fg-primary)', margin: 0 }}>{c.label}</p>
                            <p style={{ fontSize: '11px', color: 'var(--dm-color-fg-tertiary)', margin: '1px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</p>
                          </div>
                          <span style={{ fontSize: 'var(--dm-text-xs)', color: 'var(--dm-color-fg-tertiary)', flexShrink: 0, marginLeft: '12px' }}>
                            {formatBytes(c.size)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Save path */}
            <div style={{ marginTop: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--dm-text-xs)',
                  fontWeight: 'var(--dm-weight-medium)',
                  color: 'var(--dm-color-fg-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--dm-tracking-wide)',
                  marginBottom: '6px',
                }}
              >
                Save to
              </label>
              <input
                type="text"
                required
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                className="dm-url-input"
                style={{
                  width: '100%',
                  height: '40px',
                  background: 'var(--dm-color-bg-recessed)',
                  border: '1px solid var(--dm-color-border-default)',
                  borderRadius: 'var(--dm-radius-md)',
                  padding: '0 12px',
                  fontSize: 'var(--dm-text-sm)',
                  color: 'var(--dm-color-fg-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color var(--dm-duration-fast) ease',
                }}
              />
            </div>

            <p style={{ fontSize: '11px', color: 'var(--dm-color-fg-tertiary)', marginTop: '8px' }}>
              Files are auto-sorted by type into{' '}
              <code style={{ fontFamily: 'var(--dm-font-mono)', color: 'var(--dm-color-fg-secondary)' }}>
                Videos / Music / Documents / Archives / Pictures / Software / Other
              </code>{' '}
              subfolders.
            </p>

            {/* Error */}
            {error && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: 'var(--dm-radius-md)',
                  background: 'var(--dm-color-status-danger-surface)',
                  color: 'var(--dm-color-status-danger-text)',
                  border: '1px solid rgba(242,87,87,0.2)',
                  fontSize: 'var(--dm-text-xs)',
                }}
              >
                {error}
              </div>
            )}

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '24px',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="dm-cancel-btn"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--dm-color-border-default)',
                  borderRadius: 'var(--dm-radius-md)',
                  padding: '8px 16px',
                  fontSize: 'var(--dm-text-sm)',
                  fontWeight: 'var(--dm-weight-medium)',
                  color: 'var(--dm-color-fg-secondary)',
                  cursor: 'pointer',
                  transition: 'background var(--dm-duration-fast) ease, color var(--dm-duration-fast) ease',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  background: 'var(--dm-color-accent-primary)',
                  border: 'none',
                  borderRadius: 'var(--dm-radius-md)',
                  padding: '8px 18px',
                  fontSize: 'var(--dm-text-sm)',
                  fontWeight: 'var(--dm-weight-semibold)',
                  color: '#fff',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  opacity: canSubmit ? 1 : 0.5,
                  transition: 'background var(--dm-duration-fast) ease, opacity var(--dm-duration-fast) ease',
                }}
                onMouseEnter={(e) => {
                  if (canSubmit) e.currentTarget.style.background = 'var(--dm-color-accent-primary-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--dm-color-accent-primary)';
                }}
              >
                {loading
                  ? 'Adding…'
                  : isPlaylist
                    ? 'Queue Playlist'
                    : probe
                      ? 'Download Media'
                      : 'Add Download'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
