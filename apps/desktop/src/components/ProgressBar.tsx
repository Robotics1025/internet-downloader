import type { DownloadStatus } from '../types';

interface ProgressBarProps {
  percent: number | null;
  status: DownloadStatus;
  height?: number;
  showStripes?: boolean;
}

const shimmerKeyframes = `
@keyframes dm-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
@keyframes dm-indeterminate {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}
`;

export function ProgressBar({ percent, status, height = 4, showStripes = false }: ProgressBarProps) {
  const pct = percent ?? 0;
  const isActive = status === 'downloading' || status === 'merging';
  const isPaused = status === 'paused';
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';
  const isIndeterminate = isActive && percent === null;

  // Map status to design token CSS vars
  const fillColor = isCompleted
    ? 'var(--dm-color-status-success-text)'
    : isFailed
    ? 'var(--dm-color-status-danger-text)'
    : isPaused
    ? 'var(--dm-color-status-warning-text)'
    : 'var(--dm-color-accent-primary)';

  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div
        role="progressbar"
        aria-valuenow={percent ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Download progress: ${percent !== null ? Math.round(percent) + '%' : 'in progress'}`}
        style={{
          width: '100%',
          height: `${height}px`,
          background: 'var(--dm-color-bg-recessed)',
          borderRadius: 'var(--dm-radius-full)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {isIndeterminate ? (
          /* Indeterminate shimmer — gradient sliding across the track */
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(
                90deg,
                transparent 0%,
                ${fillColor} 40%,
                var(--dm-color-accent-subtle) 60%,
                transparent 100%
              )`,
              backgroundSize: '200px 100%',
              backgroundRepeat: 'no-repeat',
              animation: 'dm-indeterminate 1.4s ease-in-out infinite',
            }}
          />
        ) : (
          <div
            style={{
              height: '100%',
              width: `${Math.min(Math.max(pct, 0), 100)}%`,
              background: fillColor,
              borderRadius: 'var(--dm-radius-full)',
              transition: `width var(--dm-duration-normal) var(--dm-easing-standard)`,
              position: 'relative',
              overflow: 'hidden',
              // Glow effect on active downloads
              boxShadow: isActive ? `0 0 8px color-mix(in srgb, ${fillColor} 60%, transparent)` : 'none',
            }}
          >
            {/* Shimmer sweep for active progress */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '30%',
                  height: '100%',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)',
                  animation: 'dm-shimmer 1.6s ease-in-out infinite',
                }}
              />
            )}
            {/* Diagonal stripe overlay for paused */}
            {(isPaused || showStripes) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `repeating-linear-gradient(
                    -45deg,
                    transparent,
                    transparent 4px,
                    rgba(255,255,255,0.10) 4px,
                    rgba(255,255,255,0.10) 8px
                  )`,
                }}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
