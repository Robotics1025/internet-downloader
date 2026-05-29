import { useCallback, useEffect, useRef, useState } from 'react';
import type { Download, ProgressSnapshot } from '../types';
import { streamUrl } from '../api';
import { DownloadRow } from './DownloadRow';

interface InlineMediaPlayerProps {
  download: Download;
  playlist: Download[];
  progress: Record<string, ProgressSnapshot>;
  onClose: () => void;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  onReveal: (id: string) => void;
  actioning: Record<string, boolean>;
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

export function InlineMediaPlayer({
  download, playlist, progress, onClose, onSelect, onStart, onDelete, onReveal, actioning
}: InlineMediaPlayerProps) {
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
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const src = streamUrl(download.id);
  const currentIndex = playlist.findIndex(d => d.id === download.id);

  /* ── helpers ── */
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
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await el.requestPictureInPicture();
    } catch (e) { console.error('PiP error', e); }
  }, []);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) onSelect(playlist[currentIndex - 1].id);
  }, [currentIndex, playlist, onSelect]);

  const handleNext = useCallback(() => {
    if (currentIndex < playlist.length - 1) onSelect(playlist[currentIndex + 1].id);
  }, [currentIndex, playlist, onSelect]);

  function handleRateChange(r: number) {
    const v = videoRef.current;
    if (v) { v.playbackRate = r; setRate(r); }
    setShowRates(false);
  }

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrent(v.currentTime);
    if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
  }

  function onLoadedMeta() {
    const v = videoRef.current;
    if (v) { v.playbackRate = rate; setDuration(v.duration || 0); }
  }

  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = parseFloat(e.target.value);
    setCurrent(v.currentTime);
  }

  /* auto-hide controls after 3s of no mouse movement */
  function handleMouseMove() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  }

  const nextIndex = (currentIndex + 1) % playlist.length;
  const nextVideo = playlist[nextIndex];

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const timeLeft = duration > 0 ? duration - current : 0;
  const showCountdown = duration > 0 && timeLeft <= 5 && timeLeft > 0;

  function handleVideoEnd() {
    onSelect(nextVideo.id);
  }

  return (
    <div className="flex-1 flex flex-row min-h-0 bg-[#0a0e1a] overflow-hidden">

      {/* ═══════════════════════════════════════════════
          VIDEO PLAYER  —  takes ~60 % of the column
          ═══════════════════════════════════════════════ */}
      <div
        ref={wrapRef}
        className="relative bg-black select-none flex-1 min-w-0"
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => { if (playing) setShowControls(false); }}
      >
        {/* actual <video> */}
        <video
          key={download.id}
          ref={videoRef}
          src={src}
          className="absolute inset-0 w-full h-full object-contain cursor-pointer"
          autoPlay
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); setShowControls(true); }}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMeta}
          onEnded={handleVideoEnd}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
        />

        {/* ── top bar overlay ── */}
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? 'auto' : 'none',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all text-sm"
            >
              ←
            </button>
            <div>
              <h2 className="text-[13px] font-semibold text-white leading-tight drop-shadow">{download.file_name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="px-1 py-[1px] rounded text-[8px] font-bold text-red-400 bg-red-500/20 border border-red-500/30">
                  {download.file_name.toLowerCase().includes('4k') ? '4K' : '1080p'}
                </span>
                <span className="px-1 py-[1px] rounded text-[8px] font-bold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30">
                  {download.file_name.toLowerCase().includes('hdr') ? 'HDR' : 'SDR'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all text-sm">📸</button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all text-sm">📺</button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all text-sm">ℹ</button>
          </div>
        </div>

        {/* ── center pause indicator ── */}
        {!playing && !showCountdown && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-3xl" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}>
              ▶
            </div>
          </div>
        )}

        {/* ── up next countdown overlay ── */}
        {showCountdown && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="flex flex-col items-center bg-black/80 px-8 py-6 rounded-2xl backdrop-blur-md">
              <span className="text-white/70 text-sm mb-2 font-medium">Up Next in</span>
              <span className="text-white text-5xl font-bold mb-4">{Math.ceil(timeLeft)}</span>
              <span className="text-white/90 text-lg">{nextVideo.file_name}</span>
            </div>
          </div>
        )}

        {/* ── bottom controls overlay (YouTube-style) ── */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 pb-3 pt-16 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? 'auto' : 'none',
          }}
        >
          {/* Progress / Scrubber */}
          <div className="h-[8px] mb-2 flex items-end cursor-pointer group/scrub">
            <div className="relative w-full h-[3px] group-hover/scrub:h-[6px] transition-[height] duration-100" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <div className="absolute inset-y-0 left-0" style={{ width: `${bufPct}%`, background: 'rgba(255,255,255,0.25)' }} />
              <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: '#ff0000' }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] bg-[#ff0000] rounded-full shadow-lg transition-transform scale-0 group-hover/scrub:scale-100 pointer-events-none"
                style={{ left: `calc(${pct}% - 7px)` }}
              />
              <input type="range" min={0} max={duration || 0} step={0.1} value={current} onChange={onScrub} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </div>

          {/* Transport row */}
          <div className="flex items-center justify-between text-white px-4">
            {/* Left controls */}
            <div className="flex items-center gap-3">
              <button onClick={() => onSelect(playlist[(currentIndex - 1 + playlist.length) % playlist.length].id)} className="text-white/70 hover:text-white transition-colors text-lg">⏮</button>
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-lg shadow-lg transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)' }}
              >
                {playing ? '⏸' : '▶'}
              </button>
              <button onClick={() => onSelect(nextVideo.id)} className="text-white/70 hover:text-white transition-colors text-lg">⏭</button>

              <div className="flex items-center gap-1.5 ml-1">
                <button onClick={toggleMute} className="text-white/70 hover:text-white transition-colors">{muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</button>
                <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={e => setVolPct(parseFloat(e.target.value))} className="w-16 h-1 cursor-pointer" style={{ accentColor: '#a855f7' }} />
              </div>

              <span className="text-[12px] font-mono text-white/60 ml-2">{formatTime(current)} / {formatTime(duration)}</span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2.5">
              <button className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-white/25 text-white/60 hover:text-white hover:bg-white/10 transition-colors">CC</button>

              <div className="relative">
                <button onClick={() => setShowRates(s => !s)} className="text-[11px] font-bold px-2 py-0.5 rounded border border-white/15 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                  {rate.toFixed(1)}x
                </button>
                {showRates && (
                  <div className="absolute bottom-full right-0 mb-2 py-1 rounded-lg z-50" style={{ background: '#1a1f35', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', minWidth: '76px' }}>
                    {[0.5, 1.0, 1.25, 1.5, 2.0].map(r => (
                      <button key={r} onClick={() => handleRateChange(r)} className="w-full px-3 py-1.5 text-left text-[11px] hover:bg-purple-500/20 transition-colors" style={{ color: r === rate ? '#a855f7' : '#94a3b8' }}>
                        {r.toFixed(2)}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button className="text-white/60 hover:text-white transition-colors">⚙</button>
              <button onClick={togglePiP} title="PiP" className="text-white/60 hover:text-white transition-colors">⧉</button>
              <button onClick={toggleFullscreen} className="text-white/60 hover:text-white transition-colors text-lg">⛶</button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          PLAYLIST  —  takes ~400px width on the right
          ═══════════════════════════════════════════════ */}
      <div className="flex flex-col min-h-0 w-[400px] shrink-0" style={{ background: '#0f1423', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        {/* playlist header */}
        <div className="flex items-center justify-between px-5 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 className="text-[12px] font-semibold" style={{ color: '#94a3b8' }}>
            Downloaded Videos ({playlist.length})
          </h3>
          <div className="flex items-center gap-1">
            <button className="w-6 h-6 rounded flex items-center justify-center text-[#505a6e] hover:text-white hover:bg-white/5 transition-colors">🔍</button>
            <button className="w-6 h-6 rounded flex items-center justify-center text-[#505a6e] hover:text-white hover:bg-white/5 transition-colors">≡</button>
            <button className="w-6 h-6 rounded flex items-center justify-center text-[#505a6e] hover:text-white hover:bg-white/5 transition-colors">⊞</button>
          </div>
        </div>

        {/* scrollable list */}
        <div className="flex-1 overflow-y-auto">
          {playlist.map(d => (
            <DownloadRow
              key={d.id}
              download={d}
              progress={progress[d.id]}
              onStart={onStart}
              onDelete={onDelete}
              onPlay={onSelect}
              onReveal={onReveal}
              onSelect={onSelect}
              isSelected={d.id === download.id}
              actionLoading={actioning[d.id] || false}
              variant="playlist"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
