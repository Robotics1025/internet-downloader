import { statusColor } from '../utils';
import type { DownloadStatus } from '../types';

interface ProgressBarProps {
  percent: number | null;
  status: DownloadStatus;
}

export function ProgressBar({ percent, status }: ProgressBarProps) {
  const color = statusColor(status);
  const pct = percent ?? 0;
  const isActive = status === 'downloading';

  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${isActive ? 'relative overflow-hidden' : ''}`}
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      >
        {isActive && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
              animation: 'shimmer 1.5s infinite linear',
              backgroundSize: '200px 100%',
            }}
          />
        )}
      </div>
    </div>
  );
}
