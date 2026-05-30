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
  variant?: 'list' | 'playlist';
  index?: number;
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
}: {
  filename: string;
  status: DownloadStatus;
  url: string;
  category: string;
}) {
  const ext = fileExtLabel(filename);
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
    width: '96px',
    height: '54px',
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
            <IcoVideo size={20} />
          </div>
        )}
        {/* Duration pill */}
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            padding: '1px 4px',
            borderRadius: 'var(--dm-radius-sm)',
            background: 'rgba(13,14,18,0.70)',
            backdropFilter: 'blur(4px)',
            color: 'var(--dm-color-fg-primary)',
            fontSize: '9px',
            fontWeight: 'var(--dm-weight-medium)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.4,
          }}
        >
          {filename.toLowerCase().includes('documentary')
            ? '52:11'
            : filename.toLowerCase().includes('timelapse')
            ? '12:45'
            : '43:27'}
        </div>
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
  const iconMap: Record<string, React.ReactElement> = {
    MP3: <IcoVideo size={20} />,
    AAC: <IcoVideo size={20} />,
    FLAC: <IcoVideo size={20} />,
    WAV: <IcoVideo size={20} />,
    ZIP: <IcoFolder size={20} />,
    RAR: <IcoFolder size={20} />,
    '7Z': <IcoFolder size={20} />,
    TAR: <IcoFolder size={20} />,
    PDF: <IcoExternalLink size={20} />,
    EXE: <IcoPlay size={20} />,
    DEB: <IcoPlay size={20} />,
    DMG: <IcoPlay size={20} />,
  };
  const icon = iconMap[ext] ?? <IcoFolder size={20} />;

  return (
    <div style={{ ...thumbnailStyle, width: '54px' }}>
      <div style={{ color: 'var(--dm-color-fg-tertiary)' }}>{icon}</div>
      <div
        style={{
          position: 'absolute',
          bottom: '3px',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: '8px',
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
}) {
  const ref = useRef<HTMLDivElement>(null);

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
  const canStart = download.status === 'pending' || download.status === 'failed';

  const ext = fileExtLabel(download.file_name);
  const resolution = download.file_name.toLowerCase().includes('4k') ? '4K' : '1080p';

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
          <span style={{ padding: '1px 5px', borderRadius: 'var(--dm-radius-sm)', fontSize: '10px', fontWeight: 'var(--dm-weight-semibold)', color: 'var(--dm-color-status-danger-text)', background: 'var(--dm-color-status-danger-surface)' }}>
            {resolution}
          </span>
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
          <StatusBadge status={status} />
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
          />
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
          {resolution}
          {ext ? ` · ${ext}` : ''}
          {' · '}
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
            <StatusBadge status={status} />
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

          {/* Play (when completed) */}
          {isCompleted && (
            <ActionButton
              aria-label="Play file"
              onClick={(e) => { e.stopPropagation(); onPlay(download.id); }}
            >
              <IcoPlay size={14} />
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
