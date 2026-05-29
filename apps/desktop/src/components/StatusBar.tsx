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
        background: '#080b14',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Total Speed */}
      <div className="flex items-center gap-2 shrink-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2l-3 4h2v4h2V6h2L6 2z" fill="#22c55e" />
        </svg>
        <span style={{ color: '#505a6e' }}>Total Speed</span>
        <span className="font-semibold tabular-nums text-white">{formatSpeed(totalSpeed)}</span>
      </div>

      {/* Separator */}
      <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Overall Progress */}
      <div className="flex items-center gap-3 flex-1">
        <span style={{ color: '#505a6e' }}>Overall Progress</span>
        <div className="flex-1 max-w-[300px]">
          <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(overallPercent, 100)}%`,
                background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
                boxShadow: overallPercent > 0 ? '0 0 8px rgba(59,130,246,0.3)' : 'none',
              }}
            />
          </div>
        </div>
        <span className="font-semibold tabular-nums text-white">{Math.round(overallPercent)}%</span>
      </div>

      {/* Separator */}
      <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Active Downloads */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: activeDownloads.length > 0 ? '#22c55e' : '#505a6e',
            boxShadow: activeDownloads.length > 0 ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
          }}
        />
        <span className="font-medium text-white">{activeDownloads.length} Active Download{activeDownloads.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ETA */}
      {maxEta > 0 && (
        <>
          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex items-center gap-1.5 shrink-0">
            <span style={{ color: '#505a6e' }}>⏱</span>
            <span className="font-medium tabular-nums text-white">{formatEta(maxEta)}</span>
            <span style={{ color: '#505a6e' }}>ETA</span>
          </div>
        </>
      )}
    </footer>
  );
}
