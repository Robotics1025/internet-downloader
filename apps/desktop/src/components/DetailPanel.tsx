import { useState } from 'react';
import type { Download, ProgressSnapshot } from '../types';
import { formatBytes, formatSpeed, formatEta, formatDate, statusColor, fileTypeGradient, fileExtLabel } from '../utils';

interface DetailPanelProps {
  download: Download;
  progress: ProgressSnapshot | undefined;
  onClose: () => void;
  onPlay?: (id: string) => void;
  onReveal?: (id: string) => void;
}

type DetailTab = 'overview' | 'files' | 'connections' | 'log';

function CircularProgress({ percent, color, size = 120, strokeWidth = 8 }: {
  percent: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
          style={{
            filter: `drop-shadow(0 0 6px ${color}60)`,
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-white">
          {Math.round(percent)}%
        </span>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, valueColor }: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-xs shrink-0 mt-0.5" style={{ color: '#505a6e' }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] block" style={{ color: '#505a6e' }}>{label}</span>
        <span
          className="text-[12px] font-medium block truncate mt-0.5"
          style={{ color: valueColor || '#e2e8f0' }}
          title={value}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function DetailPanel({ download, progress, onClose, onPlay, onReveal }: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  const snap = progress;
  const downloaded = snap?.downloaded_bytes ?? download.downloaded_size;
  const total = snap?.total_size ?? download.total_size;
  const percent = snap?.percent ?? (total ? (downloaded / total) * 100 : null);
  const speed = snap?.speed_bps ?? 0;
  const eta = snap?.eta_seconds ?? null;
  const status = snap?.status ?? download.status;
  const color = statusColor(status);

  const isActive = status === 'downloading';
  const isCompleted = status === 'completed';

  const [g1, g2] = fileTypeGradient(download.file_name);
  const ext = fileExtLabel(download.file_name);
  const isVideo = download.category === 'video' || ext === 'MP4' || ext === 'MKV' || ext === 'WEBM';
  const ytMatch = download.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  const ytThumb = ytMatch ? `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg` : null;

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'files', label: 'Files' },
    { key: 'connections', label: 'Connections' },
    { key: 'log', label: 'Log' },
  ];

  return (
    <aside
      id="detail-panel"
      className="w-[300px] shrink-0 h-full flex flex-col animate-fade-slide overflow-y-auto"
      style={{
        background: '#0d1220',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <h3 className="text-[13px] font-semibold text-white truncate flex-1 pr-2" title={download.file_name}>
          {download.file_name}
        </h3>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex shrink-0 px-4 gap-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-3 py-2.5 text-[11px] font-medium transition-all relative"
            style={{
              color: activeTab === key ? '#e2e8f0' : '#505a6e',
            }}
          >
            {label}
            {activeTab === key && (
              <div
                className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                style={{ background: '#3b82f6' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto">
          {isVideo && (
            <div className="relative w-full aspect-video bg-black/50 overflow-hidden shrink-0 group" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {ytThumb ? (
                <img src={ytThumb} alt="" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              ) : (
                <div className="absolute inset-0 opacity-80" style={{ background: `linear-gradient(135deg, ${g1}40, ${g2}20)` }} />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <button className="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white transition-all transform hover:scale-110 shadow-lg" style={{ background: 'rgba(59,130,246,0.3)', backdropFilter: 'blur(4px)', border: '1px solid rgba(59,130,246,0.5)' }}>
                  ▶
                </button>
              </div>
            </div>
          )}
          
          {/* Status Indicator */}
          {isCompleted && (
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white" style={{ background: '#22c55e' }}>✓</span>
              <span className="text-[12px] font-semibold" style={{ color: '#22c55e' }}>Downloaded</span>
            </div>
          )}

          {/* Details section above tabs in the new mockup? Wait, the mockup shows Details (Resolution, Format, etc.) and THEN Tabs (Details, Files...).
              Actually let's keep tabs at the top but improve the overview layout. */}
          {/* Circular progress */}
          <div className="flex flex-col items-center py-6">
            <CircularProgress
              percent={percent ?? 0}
              color={color}
              size={130}
              strokeWidth={8}
            />

            {/* Stats row */}
            <div className="mt-5 w-full px-4 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: '#505a6e' }}>⬇ Downloaded</span>
                <span className="font-medium text-white tabular-nums">{formatBytes(downloaded)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: '#505a6e' }}>📦 Total Size</span>
                <span className="font-medium text-white tabular-nums">{formatBytes(total)}</span>
              </div>
              {isActive && speed > 0 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: '#505a6e' }}>⚡ Download Speed</span>
                  <span className="font-medium tabular-nums" style={{ color: '#22c55e' }}>
                    {formatSpeed(speed)}
                  </span>
                </div>
              )}
              {isActive && eta !== null && (
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: '#505a6e' }}>⏱ Time Left</span>
                  <span className="font-medium text-white tabular-nums">{formatEta(eta)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: '#505a6e' }}>🔄 Resume Capability</span>
                <span
                  className="font-medium"
                  style={{ color: download.resume_supported ? '#22c55e' : '#ef4444' }}
                >
                  {download.resume_supported ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

          {/* Details section */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: '#505a6e' }}>
              Details
            </p>
            {isVideo && (
              <>
                <InfoRow
                  icon="🖥"
                  label="Resolution"
                  value={download.file_name.toLowerCase().includes('4k') ? '3840 x 2160 (4K)' : '1920 x 1080 (1080p)'}
                  valueColor="#8b5cf6"
                />
                <InfoRow
                  icon="🎞"
                  label="Format"
                  value={`${ext} (H.264)`}
                />
              </>
            )}
            <InfoRow
              icon="🔗"
              label={isVideo ? 'Source URL' : 'URL'}
              value={download.url}
              valueColor="#3b82f6"
            />
            <InfoRow
              icon="📁"
              label="Save To"
              value={download.save_path}
            />
            <InfoRow
              icon="📅"
              label="Created On"
              value={formatDate(download.created_at)}
            />
            {download.completed_at && (
              <InfoRow
                icon="✅"
                label="Completed On"
                value={formatDate(download.completed_at)}
              />
            )}
          </div>

          {/* Divider */}
          <div className="mx-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

          {/* Advanced section */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: '#505a6e' }}>
              Advanced
            </p>

            {/* Connections */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: '#8892a8' }}>Connections</span>
              <div
                className="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#e2e8f0',
                }}
              >
                {download.segment_count} Threads
                <span style={{ color: '#505a6e', fontSize: '8px' }}>▼</span>
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: '#8892a8' }}>Priority</span>
              <div
                className="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#e2e8f0',
                }}
              >
                High
                <span style={{ color: '#505a6e', fontSize: '8px' }}>▼</span>
              </div>
            </div>

            {/* Start on browser send toggle */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: '#8892a8' }}>Start download on browser send</span>
              <div
                className="w-9 h-5 rounded-full relative cursor-pointer transition-all"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  boxShadow: '0 0 8px rgba(59,130,246,0.3)',
                }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ right: '2px' }}
                />
              </div>
            </div>

            {/* Speed limit */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: '#8892a8' }}>Limit download speed</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-5 rounded-full relative cursor-pointer transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{ left: '2px', background: '#505a6e' }}
                  />
                </div>
                <div
                  className="px-2 py-1 rounded text-[11px] tabular-nums"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: '#505a6e',
                  }}
                >
                  {download.speed_limit ? `${download.speed_limit}` : '2000'} KB/s
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="flex-1 p-4">
          <div
            className="rounded-xl p-4"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{
                  background: `${g1}20`,
                  color: g1,
                }}
              >
                {ext}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-white truncate">{download.file_name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#505a6e' }}>
                  {formatBytes(total)} · {ext}
                </p>
              </div>
            </div>
            <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(percent ?? 0, 100)}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'connections' && (
        <div className="flex-1 p-4 space-y-2">
          {Array.from({ length: download.segment_count }, (_, i) => (
            <div
              key={i}
              className="rounded-lg p-3"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-white">Segment {i + 1}</span>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: isActive ? 'rgba(59,130,246,0.15)' : isCompleted ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                    color: isActive ? '#3b82f6' : isCompleted ? '#22c55e' : '#505a6e',
                  }}
                >
                  {isActive ? 'Active' : isCompleted ? 'Done' : 'Idle'}
                </span>
              </div>
              <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: isCompleted ? '100%' : `${Math.max(Math.random() * 100, 30)}%`,
                    background: isActive ? '#3b82f6' : isCompleted ? '#22c55e' : '#6b7280',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'log' && (
        <div className="flex-1 p-4">
          <div
            className="rounded-xl p-3 font-mono text-[10px] space-y-1 max-h-full overflow-y-auto"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.04)',
              color: '#505a6e',
            }}
          >
            <p><span style={{ color: '#22c55e' }}>[INFO]</span> Download created at {formatDate(download.created_at)}</p>
            {download.started_at && (
              <p><span style={{ color: '#3b82f6' }}>[START]</span> Download started at {formatDate(download.started_at)}</p>
            )}
            {download.segment_count > 1 && (
              <p><span style={{ color: '#a855f7' }}>[SPLIT]</span> Split into {download.segment_count} segments</p>
            )}
            {isActive && (
              <p><span style={{ color: '#3b82f6' }}>[DL]</span> Downloading... {formatSpeed(speed)}</p>
            )}
            {download.completed_at && (
              <p><span style={{ color: '#22c55e' }}>[DONE]</span> Completed at {formatDate(download.completed_at)}</p>
            )}
            {download.error_message && (
              <p><span style={{ color: '#ef4444' }}>[ERR]</span> {download.error_message}</p>
            )}
          </div>
        </div>
      )}
      {/* Bottom Actions */}
      <div className="p-4 mt-auto border-t border-white/5 flex items-center gap-2 bg-[#0d1220]">
        <button 
          onClick={() => onPlay && onPlay(download.id)}
          className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', boxShadow: '0 4px 12px rgba(168,85,247,0.2)' }}
        >
          <span>▶</span> Play
        </button>
        <button 
          onClick={() => onReveal && onReveal(download.id)}
          className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all hover:bg-white/10"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span>📁</span> Open Folder
          <span className="ml-1 text-[#505a6e] text-[8px]">▼</span>
        </button>
      </div>
    </aside>
  );
}
