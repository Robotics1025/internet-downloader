import React, { useState, useRef, useEffect } from 'react';
import type { Download, ProgressSnapshot } from '../types';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';
import { formatBytes, formatSpeed, formatEta, fileExtLabel } from '../utils';
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
  variant?: 'list' | 'playlist' | 'grid';
  index?: number;
  /** Playlists the user can move this item into. Optional — when omitted the
   *  context menu doesn't show the "Move to playlist..." submenu. */
  playlistOptions?: { id: string; name: string }[];
  /** Called with (downloadId, targetPlaylistId) when the user picks an entry
   *  from the Move to submenu. */
  onMoveToPlaylist?: (downloadId: string, targetPlaylistId: string) => void;
}

// ── Inline SVG icons (no lucide-react dependency) ──────────────────────────

function IcoVideo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="10" height="8" rx="1.5" />
      <path d="M11 7l4-2v6l-4-2V7z" />
    </svg>
  );
}
function IcoPlay({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <polygon points="5,3 13,8 5,13" />
    </svg>
  );
}
function IcoPause({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
    </svg>
  );
}
function IcoFolder({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" />
    </svg>
  );
}
function IcoRetry({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 8a5.5 5.5 0 119.5-3.8" />
      <path d="M10 2l2 2.2-2 2" />
    </svg>
  );
}
function IcoMoreVert({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3.5" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="8" cy="12.5" r="1.3" />
    </svg>
  );
}
function IcoExternalLink({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" />
      <path d="M10 2h4v4" />
      <path d="M14 2L8 8" />
    </svg>
  );
}
function IcoCopy({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <path d="M3 11V3h8" />
    </svg>
  );
}
function IcoTrash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5l.5-8" />
    </svg>
  );
}

// ── Thumbnail component ────────────────────────────────────────────────────

function FileThumbnail({
  filename,
  status,
  url,
  category,
  variant = 'list',
}: {
  filename: string;
  status: DownloadStatus;
  url: string;
  category: string;
  variant?: 'list' | 'playlist' | 'grid';
}) {
  const ext = fileExtLabel(filename);
  const isGrid = variant === 'grid';
  const isVideo =
    category === 'video' ||
    ext === 'MP4' ||
    ext === 'MKV' ||
    ext === 'WEBM' ||
    ext === 'AVI' ||
    ext === 'MOV';

  const ytMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/,
  );
  const ytThumb = ytMatch
    ? `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`
    : null;

  const isCompleted = status === 'completed';

  const thumbnailStyle: React.CSSProperties = {
    position: 'relative',
    flexShrink: 0,
    width: isGrid ? '100%' : '96px',
    height: isGrid ? '110px' : '54px',
    borderRadius: 'var(--dm-radius-md)',
    overflow: 'hidden',
    background: 'var(--dm-color-bg-recessed)',
    border: '1px solid var(--dm-color-border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (isVideo) {
    return (
      <div style={thumbnailStyle}>
        {ytThumb ? (
          <img
            src={ytThumb}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
          />
        ) : (
          <div style={{ color: 'var(--dm-color-fg-tertiary)' }}>
            <IcoVideo size={isGrid ? 32 : 20} />
          </div>
        )}
        {/* No fake duration — real duration would come from the API */}
        {isCompleted && (
          <div
            style={{
              position: 'absolute',
              top: '4px',
              left: '4px',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: 'var(--dm-color-status-success-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 4l2 2 3-3" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  // Non-video: icon-based tile
  function IcoMusic({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 13V4l7-2v9" />
        <circle cx="4.5" cy="13" r="1.5" />
        <circle cx="11.5" cy="11" r="1.5" />
      </svg>
    );
  }
  const iconMap: Record<string, React.ReactElement> = {
    MP3: <IcoMusic size={isGrid ? 32 : 20} />,
    AAC: <IcoMusic size={isGrid ? 32 : 20} />,
    FLAC: <IcoMusic size={isGrid ? 32 : 20} />,
    WAV: <IcoMusic size={isGrid ? 32 : 20} />,
    OGG: <IcoMusic size={isGrid ? 32 : 20} />,
    M4A: <IcoMusic size={isGrid ? 32 : 20} />,
    ZIP: <IcoFolder size={isGrid ? 32 : 20} />,
    RAR: <IcoFolder size={isGrid ? 32 : 20} />,
    '7Z': <IcoFolder size={isGrid ? 32 : 20} />,
    TAR: <IcoFolder size={isGrid ? 32 : 20} />,
    PDF: <IcoExternalLink size={isGrid ? 32 : 20} />,
    EXE: <IcoPlay size={isGrid ? 32 : 20} />,
    DEB: <IcoPlay size={isGrid ? 32 : 20} />,
    DMG: <IcoPlay size={isGrid ? 32 : 20} />,
  };
  const icon = iconMap[ext] ?? <IcoFolder size={isGrid ? 32 : 20} />;

  return (
    <div style={{ ...thumbnailStyle, width: isGrid ? '100%' : '54px' }}>
      <div style={{ color: 'var(--dm-color-fg-tertiary)' }}>{icon}</div>
      <div
        style={{
          position: 'absolute',
          bottom: isGrid ? '8px' : '3px',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: isGrid ? '10px' : '8px',
          fontWeight: 'var(--dm-weight-semibold)',
          color: 'var(--dm-color-fg-tertiary)',
          letterSpacing: '0.04em',
        }}
      >
        {ext}
      </div>
    </div>
  );
}

// ── Context menu ───────────────────────────────────────────────────────────

function ContextMenu({
  open,
  isCompleted,
  isActive,
  isPaused,
  isFailed,
  onOpen,
  onReveal,
  onCopyUrl,
  onPauseResume,
  onRetry,
  onDelete,
  onClose,
  playlistOptions,
  onMoveToPlaylist,
}: {
  open: boolean;
  isCompleted: boolean;
  isActive: boolean;
  isPaused: boolean;
  isFailed: boolean;
  onOpen?: () => void;
  onReveal: () => void;
  onCopyUrl: () => void;
  onPauseResume?: () => void;
  onRetry?: () => void;
  onDelete: () => void;
  onClose: () => void;
  playlistOptions?: { id: string; name: string }[];
  onMoveToPlaylist?: (targetPlaylistId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, onClose]);

  if (!open) return null;

  const menuItemStyle = (danger = false): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 8px',
    borderRadius: 'var(--dm-radius-sm)',
    fontSize: 'var(--dm-text-sm)',
    color: danger ? 'var(--dm-color-status-danger-text)' : 'var(--dm-color-fg-primary)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: `background var(--dm-duration-fast)`,
    whiteSpace: 'nowrap' as const,
  });

  function MenuItem({
    icon,
    label,
    danger,
    onClick,
  }: {
    icon: React.ReactElement;
    label: string;
    danger?: boolean;
    onClick: () => void;
  }) {
    const [hovered, setHovered] = useState(false);
    return (
      <button
        style={{
          ...menuItemStyle(danger),
          background: hovered
            ? danger
              ? 'rgba(242,87,87,0.08)'
              : 'var(--dm-color-bg-hover)'
            : 'transparent',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <span style={{ opacity: 0.7, display: 'flex' }}>{icon}</span>
        {label}
      </button>
    );
  }

  function Divider() {
    return (
      <div
        style={{
          height: '1px',
          background: 'var(--dm-color-border-subtle)',
          margin: '3px 0',
        }}
      />
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        marginTop: '4px',
        minWidth: '148px',
        borderRadius: 'var(--dm-radius-md)',
        background: 'var(--dm-color-bg-elevated)',
        border: '1px solid var(--dm-color-border-default)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        padding: '4px',
        zIndex: 100,
      }}
    >
      {isCompleted && onOpen && (
        <MenuItem icon={<IcoExternalLink />} label="Open" onClick={onOpen} />
      )}
      <MenuItem icon={<IcoFolder />} label="Open Folder" onClick={onReveal} />
      <MenuItem icon={<IcoCopy />} label="Copy URL" onClick={onCopyUrl} />
      <Divider />
      {(isActive || isPaused) && onPauseResume && (
        <MenuItem
          icon={isActive ? <IcoPause /> : <IcoPlay />}
          label={isActive ? 'Pause' : 'Resume'}
          onClick={onPauseResume}
        />
      )}
      {isFailed && onRetry && (
        <MenuItem icon={<IcoRetry />} label="Retry" onClick={onRetry} />
      )}
      {playlistOptions && onMoveToPlaylist && playlistOptions.length > 0 && (
        <>
          <Divider />
          <div style={{ position: 'relative' }}
               onMouseEnter={() => setShowMoveSubmenu(true)}
               onMouseLeave={() => setShowMoveSubmenu(false)}>
            <MenuItem
              icon={<IcoFolder />}
              label="Move to playlist ▸"
              onClick={() => setShowMoveSubmenu(s => !s)}
            />
            {showMoveSubmenu && (
              <div
                style={{
                  position: 'absolute',
                  right: '100%',
                  top: 0,
                  marginRight: '4px',
                  minWidth: '180px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  borderRadius: 'var(--dm-radius-md)',
                  background: 'var(--dm-color-bg-elevated)',
                  border: '1px solid var(--dm-color-border-default)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                  padding: '4px',
                  zIndex: 110,
                }}
              >
                {playlistOptions.map(opt => (
                  <MenuItem
                    key={opt.id}
                    icon={<IcoFolder />}
                    label={opt.name}
                    onClick={() => { onMoveToPlaylist(opt.id); onClose(); }}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <Divider />
      <MenuItem icon={<IcoTrash />} label="Delete" danger onClick={onDelete} />
    </div>
  );
}

// ── Main DownloadRow ───────────────────────────────────────────────────────

export function DownloadRow({
  download,
  progress,
  onStart,
  onDelete,
  onPlay,
  onReveal,
  onSelect,
  isSelected,
  actionLoading,
  variant,
  index,
  playlistOptions,
  onMoveToPlaylist,
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

  const isActive = status === 'downloading' || status === 'merging';
  const isCompleted = status === 'completed';
  const isPaused = status === 'paused';
  const isFailed = status === 'failed';
  const isMissing = isCompleted && download.file_missing;
  const canStart = download.status === 'pending' || download.status === 'failed';

  const ext = fileExtLabel(download.file_name);
  const isVideo =
    download.category === 'video' ||
    ['MP4', 'MKV', 'WEBM', 'AVI', 'MOV'].includes(ext);
  const isAudio =
    download.category === 'audio' ||
    ['MP3', 'AAC', 'FLAC', 'WAV', 'OGG', 'M4A'].includes(ext);
  const isMedia = isVideo || isAudio;

  const fileNameSafe = (download.file_name || '').toLowerCase();
  const resolution = fileNameSafe.includes('4k') || fileNameSafe.includes('2160')
    ? '4K'
    : fileNameSafe.includes('1080')
    ? '1080p'
    : fileNameSafe.includes('720')
    ? '720p'
    : null;

  // ── Playlist variant ──────────────────────────────────────────────────────
  if (variant === 'playlist') {
    return (
      <div
        id={`download-row-${download.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 16px',
          cursor: 'pointer',
          background: isHovered ? 'var(--dm-color-bg-hover)' : 'transparent',
          borderBottom: '1px solid var(--dm-color-border-subtle)',
          transition: `background var(--dm-duration-fast) var(--dm-easing-standard)`,
        }}
        onClick={() => onSelect(download.id)}
        onDoubleClick={(e) => { e.preventDefault(); if (isCompleted && !isMissing) onPlay(download.id); }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setMenuOpen(false); }}
      >
        {/* Index */}
        <div
          style={{
            width: '28px',
            flexShrink: 0,
            fontSize: 'var(--dm-text-xs)',
            color: 'var(--dm-color-fg-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {index}
        </div>

        {/* Thumbnail + title */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingRight: '12px' }}>
          <FileThumbnail
            filename={download.file_name}
            status={status}
            url={download.url}
            category={download.category}
          />
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 'var(--dm-text-sm)',
                fontWeight: 'var(--dm-weight-medium)',
                color: 'var(--dm-color-fg-primary)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {download.file_name}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--dm-text-xs)', color: 'var(--dm-color-fg-tertiary)' }}>
              {download.category}
            </p>
          </div>
        </div>

        {/* Duration */}
        <div style={{ width: '52px', textAlign: 'right', fontSize: 'var(--dm-text-xs)', color: 'var(--dm-color-fg-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          03:59
        </div>

        {/* Format badges */}
        <div style={{ width: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          {resolution && (
            <span style={{ padding: '1px 5px', borderRadius: 'var(--dm-radius-sm)', fontSize: '10px', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-status-danger-text)', background: 'var(--dm-color-status-danger-surface)' }}>
              {resolution}
            </span>
          )}
          <span style={{ padding: '1px 5px', borderRadius: 'var(--dm-radius-sm)', fontSize: '10px', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-fg-secondary)', background: 'var(--dm-color-bg-recessed)' }}>
            {ext || 'MP4'}
          </span>
        </div>

        {/* Size */}
        <div style={{ width: '72px', textAlign: 'right', fontSize: 'var(--dm-text-xs)', color: 'var(--dm-color-fg-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {formatBytes(total || downloaded)}
        </div>

        {/* Status */}
        <div style={{ width: '96px', display: 'flex', justifyContent: 'flex-end' }}>
          <StatusBadge status={status} missing={isMissing} />
        </div>

        {/* Actions */}
        <div style={{ width: '32px', display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
          <button
            aria-label="More options"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--dm-radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: menuOpen ? 'var(--dm-color-bg-hover)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--dm-color-fg-tertiary)',
              transition: `color var(--dm-duration-fast), background var(--dm-duration-fast)`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--dm-color-fg-primary)'; e.currentTarget.style.background = 'var(--dm-color-bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--dm-color-fg-tertiary)'; if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <IcoMoreVert size={15} />
          </button>
          <ContextMenu
            open={menuOpen}
            isCompleted={isCompleted}
            isActive={isActive}
            isPaused={isPaused}
            isFailed={isFailed}
            onReveal={() => { onReveal(download.id); setMenuOpen(false); }}
            onCopyUrl={() => { navigator.clipboard.writeText(download.url).catch(() => {}); setMenuOpen(false); }}
            onPauseResume={isPaused || isActive ? () => { onStart(download.id); setMenuOpen(false); } : undefined}
            onRetry={isFailed ? () => { onStart(download.id); setMenuOpen(false); } : undefined}
            onDelete={() => { onDelete(download.id); setMenuOpen(false); }}
            onClose={() => setMenuOpen(false)}
            playlistOptions={playlistOptions}
            onMoveToPlaylist={
              onMoveToPlaylist
                ? (targetId) => { onMoveToPlaylist(download.id, targetId); setMenuOpen(false); }
                : undefined
            }
          />
        </div>
      </div>
    );
  }

  // ── Grid variant ─────────────────────────────────────────────────────────
  if (variant === 'grid') {
    return (
      <div
        id={`download-row-${download.id}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '12px',
          cursor: 'pointer',
          background: isSelected
            ? 'var(--dm-color-bg-selected)'
            : isHovered
            ? 'var(--dm-color-bg-elevated)'
            : 'var(--dm-color-bg-app)',
          borderLeft: isSelected
            ? '2px solid var(--dm-color-accent-primary)'
            : '2px solid transparent',
          border: isSelected
            ? '1.5px solid var(--dm-color-accent-primary)'
            : '1.5px solid var(--dm-color-border-subtle)',
          borderRadius: 'var(--dm-radius-lg)',
          transition: 'all var(--dm-duration-fast) var(--dm-easing-standard)',
          position: 'relative',
          minHeight: '230px',
          boxSizing: 'border-box',
          boxShadow: isHovered ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
          gap: '8px',
        }}
        onClick={() => onSelect(download.id)}
        onDoubleClick={(e) => { e.preventDefault(); if (isCompleted && !isMissing) onPlay(download.id); }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setMenuOpen(false); }}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      >
        {/* Thumbnail */}
        <FileThumbnail
          filename={download.file_name}
          status={status}
          url={download.url}
          category={download.category}
          variant="grid"
        />

        {/* Content Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
          {/* Title */}
          <p
            style={{
              margin: 0,
              fontSize: 'var(--dm-text-sm)',
              fontWeight: 'var(--dm-weight-semibold)',
              color: 'var(--dm-color-fg-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 'var(--dm-leading-tight)',
            }}
            title={download.file_name}
          >
            {download.file_name}
          </p>

          {/* Meta line */}
          <p
            style={{
              margin: 0,
              fontSize: 'var(--dm-text-xs)',
              color: isHovered ? 'var(--dm-color-fg-secondary)' : 'var(--dm-color-fg-tertiary)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 'var(--dm-leading-tight)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: `color var(--dm-duration-fast)`,
            }}
          >
            {resolution ? `${resolution} · ` : ''}
            {ext ? `${ext} · ` : ''}
            {formatBytes(downloaded)}
            {total ? ` / ${formatBytes(total)}` : ''}
          </p>

          {/* Progress bar */}
          <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
            <ProgressBar percent={isCompleted ? 100 : percent} status={status} height={4} />
          </div>
        </div>

        {/* Footer Area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '4px',
            borderTop: '1px solid var(--dm-color-border-subtle)',
            paddingTop: '8px',
          }}
        >
          {/* Status/percent */}
          <div>
            {isActive && percent !== null ? (
              <span
                style={{
                  fontSize: 'var(--dm-text-xs)',
                  fontWeight: 'var(--dm-weight-semibold)',
                  color: 'var(--dm-color-accent-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.round(percent)}%
              </span>
            ) : (
              <StatusBadge status={status} missing={isMissing} />
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {/* Pause (when active) */}
            {isActive && (
              <ActionButton
                aria-label="Pause download"
                onClick={(e) => { e.stopPropagation(); }}
              >
                <IcoPause size={13} />
              </ActionButton>
            )}

            {/* Play/Open (when completed, file present) */}
            {isCompleted && !isMissing && (
              <ActionButton
                aria-label={isMedia ? "Play file" : "Open file"}
                onClick={(e) => { e.stopPropagation(); onPlay(download.id); }}
              >
                {isMedia ? <IcoPlay size={13} /> : <IcoExternalLink size={13} />}
              </ActionButton>
            )}

            {/* Open folder (when completed) */}
            {isCompleted && (
              <ActionButton
                aria-label="Open folder"
                onClick={(e) => { e.stopPropagation(); onReveal(download.id); }}
              >
                <IcoFolder size={13} />
              </ActionButton>
            )}

            {/* Resume/retry */}
            {(isPaused || canStart) && (
              <ActionButton
                aria-label={isFailed ? 'Retry download' : 'Resume download'}
                disabled={actionLoading}
                onClick={(e) => { e.stopPropagation(); onStart(download.id); }}
              >
                {isFailed ? <IcoRetry size={13} /> : <IcoPlay size={13} />}
              </ActionButton>
            )}

            {/* 3-dot menu */}
            <div style={{ position: 'relative' }}>
              <ActionButton
                aria-label="More options"
                active={menuOpen}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              >
                <IcoMoreVert size={13} />
              </ActionButton>
              <ContextMenu
                open={menuOpen}
                isCompleted={isCompleted}
                isActive={isActive}
                isPaused={isPaused}
                isFailed={isFailed}
                onOpen={isCompleted && !isMissing ? () => { onPlay(download.id); setMenuOpen(false); } : undefined}
                onReveal={() => { onReveal(download.id); setMenuOpen(false); }}
                onCopyUrl={() => { navigator.clipboard.writeText(download.url).catch(() => {}); setMenuOpen(false); }}
                onPauseResume={(isActive || isPaused) ? () => { onStart(download.id); setMenuOpen(false); } : undefined}
                onRetry={isFailed ? () => { onStart(download.id); setMenuOpen(false); } : undefined}
                onDelete={() => { onDelete(download.id); setMenuOpen(false); }}
                onClose={() => setMenuOpen(false)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Standard list variant ─────────────────────────────────────────────────
  return (
    <div
      id={`download-row-${download.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 16px',
        cursor: 'pointer',
        background: isSelected
          ? 'var(--dm-color-bg-selected)'
          : isHovered
          ? 'var(--dm-color-bg-elevated)'
          : 'transparent',
        borderLeft: isSelected
          ? '2px solid var(--dm-color-accent-primary)'
          : '2px solid transparent',
        borderBottom: '1px solid var(--dm-color-border-subtle)',
        transition: `background var(--dm-duration-fast) var(--dm-easing-standard)`,
        position: 'relative',
        minHeight: '64px',
        boxSizing: 'border-box',
      }}
      onClick={() => onSelect(download.id)}
      onDoubleClick={(e) => { e.preventDefault(); if (isCompleted && !isMissing) onPlay(download.id); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setMenuOpen(false); }}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
    >
      {/* Thumbnail */}
      <FileThumbnail
        filename={download.file_name}
        status={status}
        url={download.url}
        category={download.category}
      />

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Title */}
        <p
          style={{
            margin: 0,
            fontSize: 'var(--dm-text-md)',
            fontWeight: 'var(--dm-weight-medium)',
            color: 'var(--dm-color-fg-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 'var(--dm-leading-tight)',
          }}
          title={download.file_name}
        >
          {download.file_name}
        </p>

        {/* Meta line */}
        <p
          style={{
            margin: 0,
            fontSize: 'var(--dm-text-xs)',
            color: isHovered ? 'var(--dm-color-fg-secondary)' : 'var(--dm-color-fg-tertiary)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 'var(--dm-leading-tight)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: `color var(--dm-duration-fast)`,
          }}
        >
          {resolution ? `${resolution} · ` : ''}
          {ext ? `${ext} · ` : ''}
          {formatBytes(downloaded)}
          {total ? ` / ${formatBytes(total)}` : ''}
          {isActive && speed > 0 ? ` · ${formatSpeed(speed)}` : ''}
          {isActive && eta !== null ? ` · ${formatEta(eta)}` : ''}
        </p>

        {/* Progress bar (always shown, fills width) */}
        <ProgressBar percent={isCompleted ? 100 : percent} status={status} height={4} />
      </div>

      {/* Right cluster */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px',
          minWidth: '96px',
        }}
      >
        {/* Status/percent row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isActive && percent !== null ? (
            <span
              style={{
                fontSize: 'var(--dm-text-xs)',
                fontWeight: 'var(--dm-weight-semibold)',
                color: 'var(--dm-color-accent-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(percent)}%
            </span>
          ) : (
            <StatusBadge status={status} missing={isMissing} />
          )}
        </div>

        {/* Action buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {/* Pause (when active) */}
          {isActive && (
            <ActionButton
              aria-label="Pause download"
              onClick={(e) => { e.stopPropagation(); }}
            >
              <IcoPause size={14} />
            </ActionButton>
          )}

          {/* Play/Open (when completed, file present) */}
          {isCompleted && !isMissing && (
            <ActionButton
              aria-label={isMedia ? "Play file" : "Open file"}
              onClick={(e) => { e.stopPropagation(); onPlay(download.id); }}
            >
              {isMedia ? <IcoPlay size={14} /> : <IcoExternalLink size={14} />}
            </ActionButton>
          )}

          {/* Open folder (when completed) */}
          {isCompleted && (
            <ActionButton
              aria-label="Open folder"
              onClick={(e) => { e.stopPropagation(); onReveal(download.id); }}
            >
              <IcoFolder size={14} />
            </ActionButton>
          )}

          {/* Resume/retry */}
          {(isPaused || canStart) && (
            <ActionButton
              aria-label={isFailed ? 'Retry download' : 'Resume download'}
              disabled={actionLoading}
              onClick={(e) => { e.stopPropagation(); onStart(download.id); }}
            >
              {isFailed ? <IcoRetry size={14} /> : <IcoPlay size={14} />}
            </ActionButton>
          )}

          {/* 3-dot menu */}
          <div style={{ position: 'relative' }}>
            <ActionButton
              aria-label="More options"
              active={menuOpen}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            >
              <IcoMoreVert size={14} />
            </ActionButton>
            <ContextMenu
              open={menuOpen}
              isCompleted={isCompleted}
              isActive={isActive}
              isPaused={isPaused}
              isFailed={isFailed}
              onOpen={isCompleted ? () => { onPlay(download.id); setMenuOpen(false); } : undefined}
              onReveal={() => { onReveal(download.id); setMenuOpen(false); }}
              onCopyUrl={() => { navigator.clipboard.writeText(download.url).catch(() => {}); setMenuOpen(false); }}
              onPauseResume={(isActive || isPaused) ? () => { onStart(download.id); setMenuOpen(false); } : undefined}
              onRetry={isFailed ? () => { onStart(download.id); setMenuOpen(false); } : undefined}
              onDelete={() => { onDelete(download.id); setMenuOpen(false); }}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared action button ───────────────────────────────────────────────────

function ActionButton({
  children,
  onClick,
  disabled,
  active,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  'aria-label'?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '24px',
        height: '24px',
        borderRadius: 'var(--dm-radius-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active || hovered ? 'var(--dm-color-bg-hover)' : 'transparent',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: hovered ? 'var(--dm-color-fg-primary)' : 'var(--dm-color-fg-tertiary)',
        opacity: disabled ? 0.4 : 1,
        transition: `color var(--dm-duration-fast), background var(--dm-duration-fast)`,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
