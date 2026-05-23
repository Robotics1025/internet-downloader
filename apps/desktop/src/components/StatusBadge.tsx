import type { DownloadStatus } from '../types';
import { statusColor, statusLabel } from '../utils';

interface StatusBadgeProps {
  status: DownloadStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${color}22`, color }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === 'downloading' ? 'animate-pulse' : ''}`}
        style={{ background: color }}
      />
      {statusLabel(status)}
    </span>
  );
}
