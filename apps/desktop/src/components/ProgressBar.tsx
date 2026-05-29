import { statusColor } from '../utils';
import type { DownloadStatus } from '../types';

interface ProgressBarProps {
  percent: number | null;
  status: DownloadStatus;
  height?: number;
  showStripes?: boolean;
}

export function ProgressBar({ percent, status, height = 4, showStripes = false }: ProgressBarProps) {
  const color = statusColor(status);
  const pct = percent ?? 0;
  const isActive = status === 'downloading';
  const isPaused = status === 'paused';
  const isFailed = status === 'failed';

  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{
        height: `${height}px`,
        background: 'rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: isFailed
            ? `linear-gradient(90deg, ${color}, ${color}cc)`
            : isPaused
              ? `linear-gradient(90deg, ${color}, ${color}cc)`
              : `linear-gradient(90deg, ${color}, ${color}dd)`,
          boxShadow: isActive ? `0 0 12px ${color}40` : 'none',
        }}
      >
        {/* Shimmer effect for active downloads */}
        {isActive && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
              animation: 'shimmer 1.5s infinite linear',
              backgroundSize: '200px 100%',
            }}
          />
        )}
        {/* Stripe pattern for paused */}
        {(showStripes || isPaused) && (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 5px,
                rgba(255,255,255,0.08) 5px,
                rgba(255,255,255,0.08) 10px
              )`,
              backgroundSize: '30px 30px',
              animation: isPaused ? 'none' : 'progress-stripe 0.6s linear infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}
