import type { DownloadStatus } from '../types';
import { statusColor, statusLabel } from '../utils';

interface StatusBadgeProps {
  status: DownloadStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = statusColor(status);
  const isActive = status === 'downloading';
  const isPaused = status === 'paused';
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{
        background: `${color}15`,
        color,
        border: `1px solid ${color}20`,
      }}
    >
      {isCompleted ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.5" fill={`${color}30`} />
          <path d="M4 6l1.5 1.5L8 5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : isFailed ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke={color} strokeWidth="1.5" fill={`${color}30`} />
          <path d="M4.5 4.5l3 3M7.5 4.5l-3 3" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ) : isPaused ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <rect x="3.5" y="3" width="1.8" height="6" rx="0.5" fill={color} />
          <rect x="6.8" y="3" width="1.8" height="6" rx="0.5" fill={color} />
        </svg>
      ) : (
        <span
          className={`w-[6px] h-[6px] rounded-full ${isActive ? 'animate-pulse' : ''}`}
          style={{ background: color }}
        />
      )}
      {statusLabel(status)}
    </span>
  );
}
