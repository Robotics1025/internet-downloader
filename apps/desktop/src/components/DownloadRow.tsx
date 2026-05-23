import type { Download, ProgressSnapshot } from '../types';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { formatBytes, formatSpeed, formatEta, fileExtIcon } from '../utils';

interface DownloadRowProps {
  download: Download;
  progress: ProgressSnapshot | undefined;
  onStart: (id: string) => void;
  actionLoading: boolean;
}

export function DownloadRow({ download, progress, onStart, actionLoading }: DownloadRowProps) {
  const snap = progress;
  const downloaded = snap?.downloaded_bytes ?? download.downloaded_size;
  const total = snap?.total_size ?? download.total_size;
  const percent = snap?.percent ?? (total ? (downloaded / total) * 100 : null);
  const speed = snap?.speed_bps ?? 0;
  const eta = snap?.eta_seconds ?? null;
  const status = snap?.status ?? download.status;

  const canStart = download.status === 'pending' || download.status === 'failed';

  return (
    <div
      className="group flex flex-col gap-2.5 px-5 py-4 transition-colors animate-fade-slide"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Top row: icon + name + badge + actions */}
      <div className="flex items-center gap-3">
        {/* File type icon */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {fileExtIcon(download.file_name)}
        </div>

        {/* Name + path */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate" title={download.file_name}>
            {download.file_name}
          </p>
          <p className="text-xs truncate mt-0.5" style={{ color: '#475569' }} title={download.url}>
            {download.url.replace(/^https?:\/\//, '')}
          </p>
        </div>

        {/* Status badge */}
        <StatusBadge status={status} />

        {/* Actions */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          {canStart && (
            <button
              onClick={() => onStart(download.id)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: actionLoading ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99,102,241,0.2)',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (!actionLoading) e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; }}
              onMouseLeave={e => { if (!actionLoading) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
            >
              {actionLoading ? '…' : '▶ Start'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar percent={percent} status={status} />

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs" style={{ color: '#475569' }}>
        <span className="tabular-nums">
          {formatBytes(downloaded)}
          {total ? ` / ${formatBytes(total)}` : ''}
        </span>

        {status === 'downloading' && speed > 0 && (
          <>
            <span className="flex items-center gap-1" style={{ color: '#6366f1' }}>
              <span>↑↓</span>
              <span className="tabular-nums font-medium">{formatSpeed(speed)}</span>
            </span>
            {eta !== null && (
              <span className="tabular-nums">ETA {formatEta(eta)}</span>
            )}
          </>
        )}

        {percent !== null && (
          <span className="ml-auto tabular-nums font-semibold" style={{ color: percent >= 100 ? '#22d3ee' : '#94a3b8' }}>
            {Math.min(percent, 100).toFixed(1)}%
          </span>
        )}

        {status === 'completed' && download.completed_at && (
          <span className="ml-auto" style={{ color: '#22d3ee' }}>
            ✓ Done
          </span>
        )}

        {status === 'failed' && download.error_message && (
          <span className="ml-auto text-xs truncate max-w-xs" style={{ color: '#f87171' }} title={download.error_message}>
            ✕ {download.error_message}
          </span>
        )}
      </div>
    </div>
  );
}
