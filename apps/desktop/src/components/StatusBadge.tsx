import type { DownloadStatus } from '../types';

interface StatusBadgeProps {
  status: DownloadStatus;
}

const pulseKeyframes = `
@keyframes dm-badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`;

const STATUS_CONFIG: Record<
  DownloadStatus,
  { bg: string; fg: string; label: string; dot?: boolean }
> = {
  pending: {
    bg: 'var(--dm-color-status-info-surface)',
    fg: 'var(--dm-color-status-info-text)',
    label: 'Pending',
  },
  queued: {
    bg: 'var(--dm-color-bg-recessed)',
    fg: 'var(--dm-color-fg-tertiary)',
    label: 'Queued',
  },
  downloading: {
    bg: 'var(--dm-color-status-info-surface)',
    fg: 'var(--dm-color-status-info-text)',
    label: 'Active',
    dot: true,
  },
  paused: {
    bg: 'var(--dm-color-status-warning-surface)',
    fg: 'var(--dm-color-status-warning-text)',
    label: 'Paused',
  },
  merging: {
    bg: 'var(--dm-color-status-info-surface)',
    fg: 'var(--dm-color-status-info-text)',
    label: 'Merging',
    dot: true,
  },
  completed: {
    bg: 'var(--dm-color-status-success-surface)',
    fg: 'var(--dm-color-status-success-text)',
    label: 'Done',
  },
  failed: {
    bg: 'var(--dm-color-status-danger-surface)',
    fg: 'var(--dm-color-status-danger-text)',
    label: 'Failed',
  },
  cancelled: {
    bg: 'var(--dm-color-bg-recessed)',
    fg: 'var(--dm-color-fg-tertiary)',
    label: 'Cancelled',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <>
      <style>{pulseKeyframes}</style>
      <span
        role="status"
        aria-label={`Status: ${cfg.label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 8px',
          borderRadius: 'var(--dm-radius-full)',
          background: cfg.bg,
          color: cfg.fg,
          fontSize: 'var(--dm-text-xs)',
          fontWeight: 'var(--dm-weight-medium)',
          lineHeight: 'var(--dm-leading-tight)',
          letterSpacing: 'var(--dm-tracking-wide)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {cfg.dot && (
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: cfg.fg,
              flexShrink: 0,
              animation: 'dm-badge-pulse 1.4s ease-in-out infinite',
            }}
          />
        )}
        {cfg.label}
      </span>
    </>
  );
}
