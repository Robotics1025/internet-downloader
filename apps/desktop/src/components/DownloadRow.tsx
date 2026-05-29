import { useState } from 'react';
import type { Download, ProgressSnapshot } from '../types';
import { ProgressBar } from './ProgressBar';
import { formatBytes, formatSpeed, formatEta, fileTypeGradient, fileExtLabel, statusColor } from '../utils';
import type { DownloadStatus } from '../types';

interface DownloadRowProps {
  download: Download;
  progress: ProgressSnapshot | undefined;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
  onReveal: (id: string) => void;
  onSelect: (id: string) => void;
  isSelected: boolean;
  actionLoading: boolean;
  variant?: 'list' | 'playlist';
  index?: number;
}

function FileThumbnail({ filename, status, url, category }: { filename: string; status: DownloadStatus; url: string; category: string }) {
  const [g1, g2] = fileTypeGradient(filename);
  const ext = fileExtLabel(filename);
  const isCompleted = status === 'completed';
  const isVideo = category === 'video' || ext === 'MP4' || ext === 'MKV' || ext === 'WEBM';

  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  const ytThumb = ytMatch ? `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg` : null;

  if (isVideo) {
    return (
      <div className="relative shrink-0 w-[96px] h-[54px] rounded-lg overflow-hidden flex items-center justify-center transition-all border" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#0a0e1a' }}>
        {ytThumb ? (
          <img src={ytThumb} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
        ) : (
          <div className="absolute inset-0 opacity-80" style={{ background: `linear-gradient(135deg, ${g1}40, ${g2}20)` }} />
        )}
        
        {/* Play icon overlay */}
        {!ytThumb && <span className="absolute text-xl" style={{ color: 'rgba(255,255,255,0.3)' }}>▶</span>}

        {/* Resolution badge */}
        <div className="absolute bottom-1 left-1 px-1 py-[1px] rounded text-[8px] font-bold bg-black/70 text-white backdrop-blur-sm border border-white/10">
          {filename.toLowerCase().includes('4k') ? '4K' : '1080p'}
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-1 right-1 px-1 py-[1px] rounded text-[8px] font-medium bg-black/70 text-white backdrop-blur-sm">
          {filename.toLowerCase().includes('documentary') ? '52:11' : filename.toLowerCase().includes('timelapse') ? '12:45' : '43:27'}
        </div>

        {isCompleted && (
          <div
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] z-10"
            style={{
              background: '#22c55e',
              border: '2px solid #0f1423',
              color: 'white',
            }}
          >
            ✓
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <div
        className="w-[52px] h-[52px] rounded-xl flex items-center justify-center text-white text-sm font-bold relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${g1}30, ${g2}15)`,
          border: `1px solid ${g1}25`,
        }}
      >
        {/* Background icon */}
        <div
          className="absolute inset-0 flex items-center justify-center text-2xl opacity-20"
          style={{ color: g1 }}
        >
          {ext === 'MP4' || ext === 'MKV' || ext === 'AVI' || ext === 'MOV' || ext === 'WEBM' ? '▶' :
           ext === 'MP3' || ext === 'AAC' || ext === 'FLAC' || ext === 'WAV' ? '♪' :
           ext === 'ZIP' || ext === 'RAR' || ext === '7Z' || ext === 'TAR' ? '⧈' :
           ext === 'PDF' || ext === 'DOC' || ext === 'TXT' ? '📄' :
           ext === 'EXE' || ext === 'MSI' || ext === 'DEB' || ext === 'DMG' ? '⚙' :
           '📁'}
        </div>
        {/* Extension label */}
        <span
          className="relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: `${g1}40`,
            color: g1,
          }}
        >
          {ext}
        </span>
      </div>
      {/* Completed checkmark overlay */}
      {isCompleted && (
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          style={{
            background: '#22c55e',
            border: '2px solid #0f1423',
            color: 'white',
          }}
        >
          ✓
        </div>
      )}
    </div>
  );
}

export function DownloadRow({
  download, progress, onStart, onDelete, onPlay, onReveal, onSelect, isSelected, actionLoading, variant, index
}: DownloadRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const snap = progress;
  const downloaded = snap?.downloaded_bytes ?? download.downloaded_size;
  const total = snap?.total_size ?? download.total_size;
  const percent = snap?.percent ?? (total ? (downloaded / total) * 100 : null);
  const speed = snap?.speed_bps ?? 0;
  const eta = snap?.eta_seconds ?? null;
  const status = snap?.status ?? download.status;
  const color = statusColor(status);

  const canStart = download.status === 'pending' || download.status === 'failed';
  const isActive = status === 'downloading';
  const isCompleted = status === 'completed';
  const isPaused = status === 'paused';
  const isFailed = status === 'failed';

  if (variant === 'playlist') {
    const isCompleted = status === 'completed';
    return (
      <div
        id={`download-row-${download.id}`}
        className="group flex items-center px-4 py-2 transition-all duration-200 cursor-pointer"
        style={{
          background: isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          borderBottom: '1px solid rgba(255,255,255,0.02)',
        }}
        onClick={() => onSelect(download.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setMenuOpen(false); }}
      >
        {/* Index */}
        <div className="w-8 text-xs font-medium" style={{ color: '#505a6e' }}>
          {index}
        </div>

        {/* Title & Thumbnail */}
        <div className="flex-1 flex items-center gap-3 min-w-0 pr-4">
          <FileThumbnail filename={download.file_name} status={status} url={download.url} category={download.category} />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white truncate">{download.file_name}</span>
            <span className="text-xs truncate" style={{ color: '#8892a8' }}>{download.category === 'video' ? 'Rema' : 'Unknown'}</span>
          </div>
        </div>

        {/* Duration */}
        <div className="w-24 text-right text-xs" style={{ color: '#8892a8' }}>
          03:59
        </div>

        {/* Resolution */}
        <div className="w-32 text-center flex items-center justify-center gap-2">
           <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
             {download.file_name.toLowerCase().includes('4k') ? '4K' : '1080p'}
           </span>
           <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border" style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.1)' }}>
             MP4
           </span>
        </div>

        {/* Size */}
        <div className="w-24 text-right text-xs" style={{ color: '#8892a8' }}>
          {formatBytes(total || downloaded)}
        </div>

        {/* Status */}
        <div className="w-32 text-center flex items-center justify-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: isCompleted ? '#22c55e' : color }}>
            {isCompleted ? 'Downloaded' : status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
          {isCompleted && (
             <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center text-[10px] text-green-400">
               ✓
             </div>
          )}
        </div>

        {/* Actions */}
        <div className="w-12 flex justify-end relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#505a6e] hover:text-white transition-colors"
          >
            ⋮
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-32 rounded-lg py-1 z-50 animate-slide-down"
              style={{
                background: '#13192b',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(download.id); setMenuOpen(false); }}
                className="w-full px-3 py-1.5 text-[11px] text-left text-red-400 hover:bg-red-500/10 transition-colors"
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id={`download-row-${download.id}`}
      className="group flex items-center gap-4 px-5 py-3.5 transition-all duration-200 cursor-pointer animate-fade-slide relative"
      style={{
        background: isSelected
          ? 'rgba(59,130,246,0.06)'
          : isHovered
            ? 'rgba(255,255,255,0.02)'
            : 'transparent',
        borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
      }}
      onClick={() => onSelect(download.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setMenuOpen(false); }}
    >
      {/* File thumbnail */}
      <FileThumbnail filename={download.file_name} status={status} url={download.url} category={download.category} />

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Title row */}
        <div className="flex items-center gap-3">
          <p className="text-[13px] font-semibold text-white truncate flex-1" title={download.file_name}>
            {download.file_name}
          </p>
        </div>

        {/* Size + speed info with optional badges */}
        <div className="flex items-center gap-2 text-[11px]" style={{ color: '#8892a8' }}>
          {(download.category === 'video' || fileExtLabel(download.file_name) === 'MP4' || fileExtLabel(download.file_name) === 'MKV') && (
            <div className="flex items-center gap-1.5 mr-1 shrink-0">
              <span className="px-1 py-[1px] rounded text-[9px] font-bold" style={{
                color: download.file_name.toLowerCase().includes('4k') ? '#ef4444' : '#eab308',
                background: download.file_name.toLowerCase().includes('4k') ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
                border: `1px solid ${download.file_name.toLowerCase().includes('4k') ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)'}`
              }}>
                {download.file_name.toLowerCase().includes('4k') ? '4K' : '1080p'}
              </span>
              <span className="px-1 py-[1px] rounded text-[9px] font-bold" style={{
                color: '#a855f7',
                background: 'rgba(168,85,247,0.1)',
                border: '1px solid rgba(168,85,247,0.2)'
              }}>
                {fileExtLabel(download.file_name) || 'MP4'}
              </span>
            </div>
          )}
          <span className="tabular-nums">
            {formatBytes(downloaded)}
            {total ? ` / ${formatBytes(total)}` : ''}
          </span>
          {isActive && speed > 0 && (
            <>
              <span style={{ color: '#505a6e' }}>•</span>
              <span className="tabular-nums font-medium" style={{ color: '#3b82f6' }}>
                {formatSpeed(speed)}
              </span>
            </>
          )}
        </div>

        {/* Progress bar - only show for non-completed or if there's progress */}
        {!isCompleted && (
          <ProgressBar percent={percent} status={status} height={4} />
        )}
        {isCompleted && (
          <ProgressBar percent={100} status={status} height={4} />
        )}
      </div>

      {/* Percentage display */}
      <div className="shrink-0 w-14 text-right">
        {isActive && percent !== null ? (
          <span className="text-lg font-bold tabular-nums" style={{ color }}>
            {Math.round(percent)}%
          </span>
        ) : isPaused && percent !== null ? (
          <span className="text-sm font-semibold" style={{ color }}>
            Paused
          </span>
        ) : isCompleted ? (
          <span className="text-sm font-semibold" style={{ color }}>
            Completed
          </span>
        ) : isFailed ? (
          <span className="text-sm font-semibold" style={{ color }}>
            Failed
          </span>
        ) : percent !== null ? (
          <span className="text-sm font-medium tabular-nums" style={{ color: '#8892a8' }}>
            {Math.round(percent)}%
          </span>
        ) : null}
      </div>

      {/* ETA */}
      {isActive && eta !== null && (
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: '#505a6e' }}>
          {formatEta(eta)}
        </span>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Pause / Play / Resume */}
        {isActive && (
          <button
            title="Pause"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all duration-200"
            style={{
              background: 'rgba(245,158,11,0.1)',
              color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.15)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.1)')}
          >
            ⏸
          </button>
        )}

        {isCompleted && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(download.id); }}
              title="Play"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all duration-200"
              style={{
                background: 'rgba(34,197,94,0.1)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.15)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.1)')}
            >
              ▶
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReveal(download.id); }}
              title="Open folder"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all duration-200"
              style={{
                background: 'rgba(59,130,246,0.1)',
                color: '#3b82f6',
                border: '1px solid rgba(59,130,246,0.15)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.1)')}
            >
              📁
            </button>
          </>
        )}

        {(isPaused || canStart) && (
          <button
            onClick={(e) => { e.stopPropagation(); onStart(download.id); }}
            disabled={actionLoading}
            title={isFailed ? 'Retry' : 'Resume'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all duration-200"
            style={{
              background: isFailed ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
              color: isFailed ? '#ef4444' : '#3b82f6',
              border: `1px solid ${isFailed ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'}`,
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              opacity: actionLoading ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!actionLoading) e.currentTarget.style.background = isFailed ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)';
            }}
            onMouseLeave={e => {
              if (!actionLoading) e.currentTarget.style.background = isFailed ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)';
            }}
          >
            {actionLoading ? '⟳' : isFailed ? '↻' : '▶'}
          </button>
        )}

        {/* Menu dots */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all duration-200"
            style={{
              background: menuOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: '#505a6e',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            ⋮
          </button>

          {/* Context menu */}
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-36 rounded-xl py-1 z-50 animate-slide-down"
              style={{
                background: '#1a2138',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              {isCompleted && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReveal(download.id); setMenuOpen(false); }}
                  className="w-full px-3 py-2 text-xs text-left transition-colors"
                  style={{ color: '#8892a8' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  📂 Open folder
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(download.id); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-xs text-left transition-colors"
                style={{ color: '#ef4444' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
