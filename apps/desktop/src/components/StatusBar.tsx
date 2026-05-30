import type { Download, ProgressSnapshot } from '../types';
import { formatSpeed, formatEta } from '../utils';

interface StatusBarProps {
  downloads: Download[];
  progress: Record<string, ProgressSnapshot>;
}

export function StatusBar({ downloads, progress }: StatusBarProps) {
  // Calculate aggregate stats
  const activeDownloads = downloads.filter(d => {
    const status = progress[d.id]?.status ?? d.status;
    return status === 'downloading';
  });

  const totalSpeed = activeDownloads.reduce((sum, d) => {
    return sum + (progress[d.id]?.speed_bps ?? 0);
  }, 0);

  // Overall progress (sum of all downloads)
  let totalDownloaded = 0;
  let totalSize = 0;
  let hasTotal = false;

  downloads.forEach(d => {
    const snap = progress[d.id];
    const dl = snap?.downloaded_bytes ?? d.downloaded_size;
    const tot = snap?.total_size ?? d.total_size;
    totalDownloaded += dl;
    if (tot) {
      totalSize += tot;
      hasTotal = true;
    }
  });

  const overallPercent = hasTotal && totalSize > 0 ? (totalDownloaded / totalSize) * 100 : 0;

  // Estimate ETA from active downloads
  const maxEta = activeDownloads.reduce((max, d) => {
    const eta = progress[d.id]?.eta_seconds;
    if (eta !== null && eta !== undefined && eta > max) return eta;
    return max;
  }, 0);

  return (
    <footer
      id="status-bar"
      className="h-9 px-5 flex items-center gap-6 shrink-0 text-[11px]"
      style={{
        background: 'var(--dm-color-bg-app)',
        borderTop: '1px solid var(--dm-color-border-subtle)',
      }}
    >
      {/* Total Speed */}
      <div className="flex items-center gap-2 shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2l-3 4h2v4h2V6h2L6 2z" fill="var(--dm-color-status-success-text)" />
        </svg>
        <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>Total Speed</span>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--dm-color-fg-primary)' }}>{formatSpeed(totalSpeed)}</span>
      </div>

      {/* Separator */}
      <div className="w-px h-4" style={{ background: 'var(--dm-color-border-subtle)' }} />

      {/* Overall Progress */}
      <div className="flex items-center gap-3 flex-1">
        <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>Overall Progress</span>
        <div className="flex-1 max-w-[300px]">
          <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--dm-color-border-subtle)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(overallPercent, 100)}%`,
                background: 'linear-gradient(90deg, var(--dm-color-status-info-text), var(--dm-color-status-success-text))',
                boxShadow: overallPercent > 0 ? '0 0 8px rgba(59,130,246,0.3)' : 'none',
              }}
            />
          </div>
        </div>
        <span className="font-semibold tabular-nums" style={{ color: 'var(--dm-color-fg-primary)' }}>{Math.round(overallPercent)}%</span>
      </div>

      {/* Separator */}
      <div className="w-px h-4" style={{ background: 'var(--dm-color-border-subtle)' }} />

      {/* Active Downloads */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: activeDownloads.length > 0 ? 'var(--dm-color-status-success-text)' : 'var(--dm-color-fg-tertiary)',
            boxShadow: activeDownloads.length > 0 ? '0 0 6px var(--dm-color-status-success-surface)' : 'none',
          }}
        />
        <span className="font-medium" style={{ color: 'var(--dm-color-fg-primary)' }}>{activeDownloads.length} Active Download{activeDownloads.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ETA */}
      {maxEta > 0 && (
        <>
          <div className="w-px h-4" style={{ background: 'var(--dm-color-border-subtle)' }} />
          <div className="flex items-center gap-1.5 shrink-0">
            <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>⏱</span>
            <span className="font-medium tabular-nums" style={{ color: 'var(--dm-color-fg-primary)' }}>{formatEta(maxEta)}</span>
            <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>ETA</span>
          </div>
        </>
      )}
    </footer>
  );
}
