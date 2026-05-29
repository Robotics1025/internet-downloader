import { useCallback, useEffect, useRef, useState } from 'react';
import type { Download } from '../types';
import { streamUrl } from '../api';

interface PlayerModalProps {
  download: Download;
  onClose: () => void;
}

type MediaKind = 'video' | 'audio' | 'image' | 'pdf' | 'other';

const VIDEO_EXT = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', 'ogv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const PDF_EXT = new Set(['pdf']);

function detectKind(name: string): MediaKind {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (PDF_EXT.has(ext)) return 'pdf';
  return 'other';
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function PlayerModal({ download, onClose }: PlayerModalProps) {
  const kind = detectKind(download.file_name);
  const src = streamUrl(download.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-2xl shadow-2xl flex flex-col"
        style={{
          maxWidth: kind === 'video' ? '1200px' : '720px',
          background: '#0b0b14',
          border: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '94vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="min-w-0 flex-1 mr-3">
            <p className="text-sm font-semibold text-white truncate" title={download.file_name}>
              {download.file_name}
            </p>
            <p className="text-[11px] truncate" style={{ color: '#64748b' }}>
              {download.save_path}
            </p>
          </div>
          <a
            href={src}
            download={download.file_name}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold mr-2"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
          >
            ⬇ Save
          </a>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base"
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {kind === 'video' && <VideoPlayer src={src} onClose={onClose} />}
          {kind === 'audio' && <AudioPlayer src={src} title={download.file_name} />}
          {kind === 'image' && (
            <div className="p-4 flex items-center justify-center">
              <img
                src={src}
                alt={download.file_name}
                className="max-w-full max-h-[78vh] rounded-lg object-contain"
              />
            </div>
          )}
          {kind === 'pdf' && (
            <iframe
              src={src}
              title={download.file_name}
              className="w-full"
              style={{ height: '80vh', background: '#fff', border: 0 }}
            />
          )}
          {kind === 'other' && (
            <div className="text-center py-16 px-6" style={{ color: '#64748b' }}>
              <div className="text-5xl mb-3">📄</div>
              <p className="text-sm">No in-app preview for this file type.</p>
              <p className="text-xs mt-1">Use ⬇ Save to copy it to your machine.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* VIDEO PLAYER                                                               */
/* -------------------------------------------------------------------------- */

function VideoPlayer({ src, onClose }: { src: string; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showRates, setShowRates] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta));
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }, []);

  const setVolPct = useCallback((v: number) => {
    const el = videoRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(1, v));
    el.volume = next;
    el.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrap.requestFullscreen();
  }, []);

  const togglePiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement === v) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { /* PiP not supported / blocked */ }
  }, []);

  const setPlaybackRate = useCallback((r: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = r;
    setRate(r);
    setShowRates(false);
  }, []);

  // Auto-hide controls during playback.
  const showControlsTemp = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setControlsVisible(false);
    }, 2200);
  }, []);

  // Keyboard shortcuts (Space / J / L / K / arrows / F / M / Esc).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen();
        else onClose();
        return;
      }
      // Ignore when typing in an input (none here, but safe for the future).
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          seek(e.key.toLowerCase() === 'l' ? 10 : 5);
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          seek(e.key.toLowerCase() === 'j' ? -10 : -5);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolPct(volume + 0.05);
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolPct(volume - 0.05);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'p':
          e.preventDefault();
          togglePiP();
          break;
      }
      showControlsTemp();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, seek, setVolPct, volume, toggleFullscreen, toggleMute, togglePiP, showControlsTemp, onClose]);

  useEffect(() => {
    return () => { if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current); };
  }, []);

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
  }

  function onLoadedMeta() {
    const v = videoRef.current;
    if (v) setDuration(v.duration || 0);
  }

  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    const t = parseFloat(e.target.value);
    v.currentTime = t;
    setCurrent(t);
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className="relative bg-black flex items-center justify-center"
      style={{ aspectRatio: '16 / 9', maxHeight: '78vh' }}
      onMouseMove={showControlsTemp}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v && !v.paused) setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        autoPlay
        onPlay={() => { setPlaying(true); showControlsTemp(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); }}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMeta}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {/* Big centre play indicator when paused */}
      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <span
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
            style={{ background: 'rgba(0,0,0,0.55)', color: 'white', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            ▶
          </span>
        </button>
      )}

      {/* Controls overlay */}
      <div
        className="absolute left-0 right-0 bottom-0 px-4 pb-3 pt-10 transition-opacity"
        style={{
          opacity: controlsVisible ? 1 : 0,
          background:
            'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
          pointerEvents: controlsVisible ? 'auto' : 'none',
        }}
      >
        {/* Scrubber */}
        <div className="relative h-1.5 mb-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${bufPct}%`, background: 'rgba(255,255,255,0.25)' }} />
          <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: '#6366f1' }} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={onScrub}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-3 text-white">
          <Btn onClick={togglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
            {playing ? '⏸' : '▶'}
          </Btn>
          <Btn onClick={() => seek(-10)} title="Back 10s (J)">⏪</Btn>
          <Btn onClick={() => seek(10)} title="Forward 10s (L)">⏩</Btn>

          <span className="text-xs tabular-nums" style={{ color: '#cbd5e1' }}>
            {formatTime(current)} <span style={{ color: '#64748b' }}>/ {formatTime(duration)}</span>
          </span>

          <div className="flex items-center gap-2 ml-3">
            <Btn onClick={toggleMute} title={muted ? 'Unmute (M)' : 'Mute (M)'}>
              {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </Btn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVolPct(parseFloat(e.target.value))}
              className="w-20 accent-indigo-500"
              style={{ accentColor: '#6366f1' }}
            />
          </div>

          <div className="ml-auto flex items-center gap-2 relative">
            <button
              onClick={() => setShowRates((s) => !s)}
              className="px-2.5 py-1 rounded-md text-xs font-semibold tabular-nums"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }}
              title="Playback speed"
            >
              {rate}x
            </button>
            {showRates && (
              <div
                className="absolute bottom-9 right-12 rounded-lg py-1"
                style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', minWidth: 80 }}
              >
                {PLAYBACK_RATES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setPlaybackRate(r)}
                    className="block w-full px-3 py-1.5 text-left text-xs"
                    style={{
                      color: r === rate ? '#a5b4fc' : '#e2e8f0',
                      background: r === rate ? 'rgba(99,102,241,0.15)' : 'transparent',
                      fontWeight: r === rate ? 700 : 400,
                    }}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            )}
            <Btn onClick={togglePiP} title="Picture-in-picture (P)">⧉</Btn>
            <Btn onClick={toggleFullscreen} title="Fullscreen (F)">⛶</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 flex items-center justify-center rounded-md transition-colors text-base"
      style={{ background: 'rgba(255,255,255,0.06)', color: '#f1f5f9' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* AUDIO PLAYER                                                               */
/* -------------------------------------------------------------------------- */

function AudioPlayer({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showRates, setShowRates] = useState(false);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  }, []);

  const seek = useCallback((delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
  }, []);

  const setPlaybackRate = useCallback((r: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = r;
    setRate(r);
    setShowRates(false);
  }, []);

  const setVolPct = useCallback((v: number) => {
    const a = audioRef.current;
    if (!a) return;
    const next = Math.max(0, Math.min(1, v));
    a.volume = next;
    a.muted = next === 0;
    setVolume(next);
    setMuted(next === 0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(5); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(-5); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, seek]);

  function onTime() {
    const a = audioRef.current;
    if (a) setCurrent(a.currentTime);
  }

  function onMeta() {
    const a = audioRef.current;
    if (a) setDuration(a.duration || 0);
  }

  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a) return;
    const t = parseFloat(e.target.value);
    a.currentTime = t;
    setCurrent(t);
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="p-8 flex flex-col items-center" style={{ background: 'linear-gradient(180deg,#1e1b4b 0%,#0b0b14 100%)' }}>
      <audio
        ref={audioRef}
        src={src}
        autoPlay
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTime}
        onLoadedMetadata={onMeta}
      />

      {/* Visual disc */}
      <div className="relative mb-6">
        <div
          className="w-44 h-44 rounded-full flex items-center justify-center text-7xl"
          style={{
            background: 'radial-gradient(circle at 30% 30%, #818cf8, #4f46e5 60%, #1e1b4b)',
            boxShadow: '0 20px 60px rgba(99,102,241,0.35)',
            animation: playing ? 'dmgrSpin 6s linear infinite' : undefined,
          }}
        >
          ♪
        </div>
        <style>{`@keyframes dmgrSpin { to { transform: rotate(360deg); } }`}</style>
      </div>

      <p className="text-sm font-semibold text-white mb-1 text-center max-w-md truncate" title={title}>
        {title}
      </p>
      <p className="text-xs mb-6" style={{ color: '#64748b' }}>
        {formatTime(current)} / {formatTime(duration)}
      </p>

      {/* Scrubber */}
      <div className="w-full max-w-xl mb-5">
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: 'linear-gradient(to right,#6366f1,#a855f7)' }} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={onScrub}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 text-white">
        <Btn onClick={() => seek(-10)} title="Back 10s">⏪</Btn>
        <button
          onClick={togglePlay}
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
          style={{ background: '#6366f1', color: 'white', boxShadow: '0 8px 20px rgba(99,102,241,0.45)' }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <Btn onClick={() => seek(10)} title="Forward 10s">⏩</Btn>
      </div>

      <div className="flex items-center gap-4 mt-5 w-full max-w-md">
        <div className="flex items-center gap-2 flex-1">
          <Btn onClick={() => setVolPct(muted ? 1 : 0)}>{muted || volume === 0 ? '🔇' : '🔊'}</Btn>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => setVolPct(parseFloat(e.target.value))}
            className="flex-1"
            style={{ accentColor: '#6366f1' }}
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowRates((s) => !s)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold tabular-nums"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }}
          >
            {rate}x
          </button>
          {showRates && (
            <div
              className="absolute bottom-10 right-0 rounded-lg py-1"
              style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', minWidth: 80 }}
            >
              {PLAYBACK_RATES.map((r) => (
                <button
                  key={r}
                  onClick={() => setPlaybackRate(r)}
                  className="block w-full px-3 py-1.5 text-left text-xs"
                  style={{
                    color: r === rate ? '#a5b4fc' : '#e2e8f0',
                    background: r === rate ? 'rgba(99,102,241,0.15)' : 'transparent',
                    fontWeight: r === rate ? 700 : 400,
                  }}
                >
                  {r}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
