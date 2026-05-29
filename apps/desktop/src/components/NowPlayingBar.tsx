import { useCallback, useEffect, useRef, useState } from 'react';
import type { Download, ProgressSnapshot } from '../types';
import { streamUrl } from '../api';
import { formatSpeed } from '../utils';

interface NowPlayingBarProps {
  currentTrack: Download | null;
  queue: Download[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onExpand: () => void;
  // Fallback download-stats payload, shown when nothing is playing.
  downloads: Download[];
  progress: Record<string, ProgressSnapshot | undefined>;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function ytThumb(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

function isVideoFile(name: string): boolean {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'ogv', 'avi'].includes(ext);
}

function uploaderFromSavePath(savePath: string | null | undefined): string | null {
  if (!savePath) return null;
  const m = savePath.match(/\/(?:Videos|Music)\/([^/]+)\/?$/);
  return m && m[1] !== 'Unknown' ? m[1] : null;
}

export function NowPlayingBar({
  currentTrack, queue, onClose, onSelect, onExpand,
  downloads, progress,
}: NowPlayingBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'all' | 'one'>('off');

  const isVideo = currentTrack ? isVideoFile(currentTrack.file_name) : false;

  // Resolve queue siblings (only completed items in the same group).
  const playableQueue = queue.filter(d => d.status === 'completed');
  const currentIndex = currentTrack
    ? playableQueue.findIndex(d => d.id === currentTrack.id)
    : -1;

  const playNext = useCallback(() => {
    if (!currentTrack || playableQueue.length === 0) return;
    if (repeat === 'one') {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; void a.play(); }
      return;
    }
    let nextIdx;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * playableQueue.length);
    } else {
      nextIdx = currentIndex + 1;
      if (nextIdx >= playableQueue.length) {
        if (repeat === 'all') nextIdx = 0;
        else return;
      }
    }
    onSelect(playableQueue[nextIdx].id);
  }, [currentTrack, playableQueue, currentIndex, repeat, shuffle, onSelect]);

  const playPrev = useCallback(() => {
    if (!currentTrack || playableQueue.length === 0) return;
    const a = audioRef.current;
    // Mimics Spotify: if past 3s, restart current; else previous track.
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    const prevIdx = currentIndex - 1;
    if (prevIdx < 0) {
      if (repeat === 'all') onSelect(playableQueue[playableQueue.length - 1].id);
      return;
    }
    onSelect(playableQueue[prevIdx].id);
  }, [currentTrack, playableQueue, currentIndex, repeat, onSelect]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  }, []);

  const setVol = useCallback((v: number) => {
    const a = audioRef.current;
    if (!a) return;
    const next = Math.max(0, Math.min(1, v));
    a.volume = next;
    a.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  }, []);

  // Reset position when the track changes.
  useEffect(() => {
    setCurrent(0);
    setDuration(0);
    const a = audioRef.current;
    if (a && currentTrack && !isVideo) {
      a.load();
      void a.play().catch(() => { /* autoplay may be blocked */ });
    }
  }, [currentTrack, isVideo]);

  // ── empty state: show download stats instead of an empty player ────────
  if (!currentTrack) {
    return <DownloadStatsStrip downloads={downloads} progress={progress} />;
  }

  const cover = ytThumb(currentTrack.url);
  const artist = uploaderFromSavePath(currentTrack.save_path) ?? '—';
  const pct = duration > 0 ? (current / duration) * 100 : 0;

  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a) return;
    const t = parseFloat(e.target.value);
    a.currentTime = t;
    setCurrent(t);
  }

  return (
    <footer
      id="now-playing-bar"
      className="h-[72px] px-4 flex items-center gap-4 shrink-0"
      style={{
        background: '#080b14',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Hidden audio engine — only mounts for audio files; videos open in
          the full player when the user clicks Expand. */}
      {!isVideo && (
        <audio
          ref={audioRef}
          src={streamUrl(currentTrack.id)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => audioRef.current && setCurrent(audioRef.current.currentTime)}
          onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration || 0)}
          onEnded={playNext}
        />
      )}

      {/* Track info (left) */}
      <button
        onClick={onExpand}
        className="flex items-center gap-3 min-w-[200px] max-w-[280px] text-left transition-opacity hover:opacity-90"
        title={isVideo ? 'Open video player' : currentTrack.file_name}
      >
        <div
          className="w-12 h-12 rounded-md shrink-0 relative overflow-hidden"
          style={{
            background: cover
              ? `center / cover no-repeat url(${cover})`
              : 'linear-gradient(135deg,#6366f1,#a855f7)',
          }}
        >
          {!cover && (
            <div className="absolute inset-0 flex items-center justify-center text-lg text-white/80">
              {isVideo ? '▶' : '♪'}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white truncate">{currentTrack.file_name}</p>
          <p className="text-[11px] truncate" style={{ color: '#8892a8' }}>{artist}</p>
        </div>
      </button>

      {/* Controls (centre) */}
      <div className="flex-1 flex flex-col items-center gap-1 min-w-0 max-w-[640px] mx-auto">
        <div className="flex items-center gap-3">
          <CtrlBtn
            on={shuffle}
            title="Shuffle"
            onClick={() => setShuffle(s => !s)}
            svg={<path d="M14 4l3 3-3 3M14 14l3 3-3 3M3 7h4l8 10h4M3 17h4l8-10h4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          />
          <CtrlBtn
            title="Previous"
            onClick={playPrev}
            disabled={playableQueue.length <= 1}
            svg={<path d="M5 5v14M19 5l-10 7 10 7V5z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" strokeLinejoin="round" />}
          />
          <button
            onClick={isVideo ? onExpand : togglePlay}
            title={isVideo ? 'Open player' : (playing ? 'Pause' : 'Play')}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105"
            style={{ background: '#6366f1', color: 'white', boxShadow: '0 0 12px rgba(99,102,241,0.45)' }}
          >
            {isVideo ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ) : playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <CtrlBtn
            title="Next"
            onClick={playNext}
            disabled={playableQueue.length <= 1}
            svg={<path d="M19 5v14M5 5l10 7-10 7V5z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" strokeLinejoin="round" />}
          />
          <CtrlBtn
            on={repeat !== 'off'}
            title={`Repeat: ${repeat}`}
            onClick={() => setRepeat(r => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
            badge={repeat === 'one' ? '1' : undefined}
            svg={<path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          />
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 w-full px-2">
          <span className="text-[10px] tabular-nums w-9 text-right" style={{ color: '#8892a8' }}>{formatTime(current)}</span>
          <div className="relative flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: '#6366f1' }} />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={onScrub}
              disabled={isVideo}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
          <span className="text-[10px] tabular-nums w-9" style={{ color: '#8892a8' }}>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right cluster (volume + close) */}
      <div className="flex items-center gap-2 min-w-[180px] justify-end">
        {!isVideo && (
          <>
            <button
              onClick={() => setVol(muted ? volume || 0.8 : 0)}
              className="w-7 h-7 flex items-center justify-center"
              style={{ color: '#8892a8' }}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={e => setVol(parseFloat(e.target.value))}
              className="w-24 cursor-pointer"
              style={{ accentColor: '#6366f1' }}
            />
          </>
        )}
        <button
          onClick={onClose}
          title="Close now playing"
          className="w-7 h-7 flex items-center justify-center rounded-md ml-1"
          style={{ color: '#8892a8', background: 'rgba(255,255,255,0.04)' }}
        >
          ✕
        </button>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function CtrlBtn({
  on, disabled, title, onClick, svg, badge,
}: {
  on?: boolean; disabled?: boolean; title?: string;
  onClick: () => void; svg: React.ReactNode; badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded transition-all relative disabled:opacity-30"
      style={{ color: on ? '#6366f1' : '#e2e8f0' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">{svg}</svg>
      {badge && (
        <span
          className="absolute -top-0.5 -right-0.5 text-[8px] font-bold leading-none px-1 rounded-full"
          style={{ background: '#6366f1', color: 'white' }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function DownloadStatsStrip({
  downloads, progress,
}: { downloads: Download[]; progress: Record<string, ProgressSnapshot | undefined> }) {
  const active = downloads.filter(d => (progress[d.id]?.status ?? d.status) === 'downloading');
  const totalSpeed = active.reduce((s, d) => s + (progress[d.id]?.speed_bps ?? 0), 0);
  let dl = 0, total = 0, hasTotal = false;
  for (const d of downloads) {
    const snap = progress[d.id];
    dl += snap?.downloaded_bytes ?? d.downloaded_size;
    const t = snap?.total_size ?? d.total_size;
    if (t) { total += t; hasTotal = true; }
  }
  const pct = hasTotal && total > 0 ? (dl / total) * 100 : 0;

  return (
    <footer
      className="h-9 px-5 flex items-center gap-5 shrink-0 text-[11px]"
      style={{ background: '#080b14', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: '#505a6e' }}>Speed</span>
        <span className="font-semibold tabular-nums text-white">{formatSpeed(totalSpeed)}</span>
      </div>
      <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="flex items-center gap-3 flex-1">
        <span style={{ color: '#505a6e' }}>Overall</span>
        <div className="flex-1 max-w-[300px] h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: 'linear-gradient(90deg,#3b82f6,#22c55e)' }} />
        </div>
        <span className="font-semibold tabular-nums text-white">{Math.round(pct)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: active.length > 0 ? '#22c55e' : '#505a6e' }} />
        <span className="font-medium text-white">{active.length} active</span>
      </div>
    </footer>
  );
}
