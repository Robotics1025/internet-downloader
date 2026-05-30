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
        <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--dm-color-fg-primary)' }}>
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
      <span className="text-xs shrink-0 mt-0.5" style={{ color: 'var(--dm-color-fg-tertiary)' }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] block" style={{ color: 'var(--dm-color-fg-tertiary)' }}>{label}</span>
        <span
          className="text-[12px] font-medium block truncate mt-0.5"
          style={{ color: valueColor || 'var(--dm-color-fg-primary)' }}
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
  const [autoStart, setAutoStart] = useState(true);
  const [limitSpeed, setLimitSpeed] = useState(!!download.speed_limit);
  const [speedVal, setSpeedVal] = useState(download.speed_limit?.toString() || '2000');

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
  const isVideo = download.category === 'video' || ['MP4', 'MKV', 'WEBM', 'AVI', 'MOV'].includes(ext);
  const isAudio = download.category === 'audio' || ['MP3', 'AAC', 'FLAC', 'WAV', 'OGG', 'M4A'].includes(ext);
  const isMedia = isVideo || isAudio;
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
        background: 'var(--dm-color-bg-elevated)',
        borderLeft: '1px solid var(--dm-color-border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--dm-color-border-subtle)' }}
      >
        <h3 className="text-[13px] font-semibold truncate flex-1 pr-2" style={{ color: 'var(--dm-color-fg-primary)' }} title={download.file_name}>
          {download.file_name}
        </h3>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: 'var(--dm-color-fg-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--dm-color-bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex shrink-0 px-4 gap-0"
        style={{ borderBottom: '1px solid var(--dm-color-border-subtle)' }}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-3 py-2.5 text-[11px] font-medium transition-all relative"
            style={{
              color: activeTab === key ? 'var(--dm-color-fg-primary)' : 'var(--dm-color-fg-tertiary)',
            }}
          >
            {label}
            {activeTab === key && (
              <div
                className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                style={{ background: 'var(--dm-color-accent-primary)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto">
          {isVideo && (
            <div className="relative w-full aspect-video bg-black/50 overflow-hidden shrink-0 group" style={{ borderBottom: '1px solid var(--dm-color-border-subtle)' }}>
              {ytThumb ? (
                <img src={ytThumb} alt="" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              ) : (
                <div className="absolute inset-0 opacity-80" style={{ background: `linear-gradient(135deg, ${g1}40, ${g2}20)` }} />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={() => onPlay && onPlay(download.id)}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl text-white transition-all transform hover:scale-110 shadow-lg"
                  style={{ background: 'rgba(59,130,246,0.4)', backdropFilter: 'blur(4px)', border: '1px solid var(--dm-color-accent-primary)' }}
                >
                  ▶
                </button>
              </div>
            </div>
          )}
          
          {/* Status Indicator */}
          {isCompleted && (
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px]" style={{ background: 'var(--dm-color-status-success-text)', color: '#fff' }}>✓</span>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--dm-color-status-success-text)' }}>Downloaded</span>
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
                <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>⬇ Downloaded</span>
                <span className="font-medium tabular-nums" style={{ color: 'var(--dm-color-fg-primary)' }}>{formatBytes(downloaded)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>📦 Total Size</span>
                <span className="font-medium tabular-nums" style={{ color: 'var(--dm-color-fg-primary)' }}>{formatBytes(total)}</span>
              </div>
              {isActive && speed > 0 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>⚡ Download Speed</span>
                  <span className="font-medium tabular-nums" style={{ color: 'var(--dm-color-status-success-text)' }}>
                    {formatSpeed(speed)}
                  </span>
                </div>
              )}
              {isActive && eta !== null && (
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>⏱ Time Left</span>
                  <span className="font-medium tabular-nums" style={{ color: 'var(--dm-color-fg-primary)' }}>{formatEta(eta)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: 'var(--dm-color-fg-tertiary)' }}>🔄 Resume Capability</span>
                <span
                  className="font-medium"
                  style={{ color: download.resume_supported ? 'var(--dm-color-status-success-text)' : 'var(--dm-color-status-danger-text)' }}
                >
                  {download.resume_supported ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4" style={{ borderTop: '1px solid var(--dm-color-border-subtle)' }} />

          {/* Details section */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--dm-color-fg-tertiary)' }}>
              Details
            </p>
            {isVideo && (
              <>
                <InfoRow
                  icon="🖥"
                  label="Resolution"
                  value={(download.file_name || '').toLowerCase().includes('4k') ? '3840 x 2160 (4K)' : '1920 x 1080 (1080p)'}
                  valueColor="var(--dm-color-accent-primary)"
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
              valueColor="var(--dm-color-status-info-text)"
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
          <div className="mx-4" style={{ borderTop: '1px solid var(--dm-color-border-subtle)' }} />

          {/* Advanced section */}
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--dm-color-fg-tertiary)' }}>
              Advanced
            </p>

            {/* Connections */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: 'var(--dm-color-fg-secondary)' }}>Connections</span>
              <div
                className="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1"
                style={{
                  background: 'var(--dm-color-bg-hover)',
                  border: '1px solid var(--dm-color-border-subtle)',
                  color: 'var(--dm-color-fg-primary)',
                }}
              >
                {download.segment_count} Threads
                <span style={{ color: 'var(--dm-color-fg-tertiary)', fontSize: '8px' }}>▼</span>
              </div>
            </div>

            {/* Priority */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: 'var(--dm-color-fg-secondary)' }}>Priority</span>
              <div
                className="px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1"
                style={{
                  background: 'var(--dm-color-bg-hover)',
                  border: '1px solid var(--dm-color-border-subtle)',
                  color: 'var(--dm-color-fg-primary)',
                }}
              >
                High
                <span style={{ color: 'var(--dm-color-fg-tertiary)', fontSize: '8px' }}>▼</span>
              </div>
            </div>

            {/* Start on browser send toggle */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: 'var(--dm-color-fg-secondary)' }}>Start download on browser send</span>
              <div
                onClick={() => setAutoStart(!autoStart)}
                className="w-9 h-5 rounded-full relative cursor-pointer transition-all"
                style={{
                  background: autoStart ? 'linear-gradient(135deg, var(--dm-color-accent-primary), var(--dm-color-accent-primary-hover))' : 'var(--dm-color-bg-hover)',
                  boxShadow: autoStart ? '0 0 8px var(--dm-color-accent-subtle)' : 'none',
                }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{
                    left: autoStart ? 'auto' : '2px',
                    right: autoStart ? '2px' : 'auto',
                    background: autoStart ? '#fff' : 'var(--dm-color-fg-tertiary)'
                  }}
                />
              </div>
            </div>

            {/* Speed limit */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px]" style={{ color: 'var(--dm-color-fg-secondary)' }}>Limit download speed</span>
              <div className="flex items-center gap-2">
                <div
                  onClick={() => setLimitSpeed(!limitSpeed)}
                  className="w-9 h-5 rounded-full relative cursor-pointer transition-all"
                  style={{
                    background: limitSpeed ? 'linear-gradient(135deg, var(--dm-color-accent-primary), var(--dm-color-accent-primary-hover))' : 'var(--dm-color-bg-hover)',
                    boxShadow: limitSpeed ? '0 0 8px var(--dm-color-accent-subtle)' : 'none',
                  }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{
                      left: limitSpeed ? 'auto' : '2px',
                      right: limitSpeed ? '2px' : 'auto',
                      background: limitSpeed ? '#fff' : 'var(--dm-color-fg-tertiary)'
                    }}
                  />
                </div>
                <input
                  type="text"
                  value={speedVal}
                  onChange={(e) => setSpeedVal(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={!limitSpeed}
                  className="px-2 py-1 rounded text-[11px] tabular-nums outline-none w-16"
                  style={{
                    background: 'var(--dm-color-bg-hover)',
                    border: limitSpeed ? '1px solid var(--dm-color-border-focus)' : '1px solid var(--dm-color-border-subtle)',
                    color: limitSpeed ? 'var(--dm-color-fg-primary)' : 'var(--dm-color-fg-tertiary)',
                  }}
                />
                <span className="text-[11px]" style={{ color: 'var(--dm-color-fg-tertiary)' }}>KB/s</span>
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
              background: 'var(--dm-color-bg-hover)',
              border: '1px solid var(--dm-color-border-subtle)',
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
                <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--dm-color-fg-primary)' }}>{download.file_name}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--dm-color-fg-tertiary)' }}>
                  {formatBytes(total)} · {ext}
                </p>
              </div>
            </div>
            <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'var(--dm-color-border-subtle)' }}>
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
          {Array.from({ length: download.segment_count }, (_, i) => {
            // Use stable per-segment progress based on overall percent
            const segPct = isCompleted
              ? 100
              : isActive
              ? Math.min(100, ((percent ?? 0) + (i % 3) * 8 - (i % 2) * 4))
              : 0;
            return (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{
                  background: 'var(--dm-color-bg-hover)',
                  border: '1px solid var(--dm-color-border-subtle)',
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--dm-color-fg-primary)' }}>Segment {i + 1}</span>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      background: isActive ? 'var(--dm-color-accent-subtle)' : isCompleted ? 'var(--dm-color-status-success-surface)' : 'var(--dm-color-bg-hover)',
                      color: isActive ? 'var(--dm-color-accent-primary)' : isCompleted ? 'var(--dm-color-status-success-text)' : 'var(--dm-color-fg-tertiary)',
                    }}
                  >
                    {isActive ? 'Active' : isCompleted ? 'Done' : 'Idle'}
                  </span>
                </div>
                <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'var(--dm-color-border-subtle)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(0, Math.min(100, segPct))}%`,
                      background: isActive
                        ? 'var(--dm-color-accent-primary)'
                        : isCompleted
                        ? 'var(--dm-color-status-success-text)'
                        : 'var(--dm-color-fg-tertiary)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'log' && (
        <div className="flex-1 p-4">
          <div
            className="rounded-xl p-3 font-mono text-[10px] space-y-1 max-h-full overflow-y-auto"
            style={{
              background: 'var(--dm-color-bg-recessed)',
              border: '1px solid var(--dm-color-border-subtle)',
              color: 'var(--dm-color-fg-tertiary)',
            }}
          >
            <p><span style={{ color: 'var(--dm-color-status-success-text)' }}>[INFO]</span> Download created at {formatDate(download.created_at)}</p>
            {download.started_at && (
              <p><span style={{ color: 'var(--dm-color-status-info-text)' }}>[START]</span> Download started at {formatDate(download.started_at)}</p>
            )}
            {download.segment_count > 1 && (
              <p><span style={{ color: 'var(--dm-color-accent-primary)' }}>[SPLIT]</span> Split into {download.segment_count} segments</p>
            )}
            {isActive && (
              <p><span style={{ color: 'var(--dm-color-status-info-text)' }}>[DL]</span> Downloading... {formatSpeed(speed)}</p>
            )}
            {download.completed_at && (
              <p><span style={{ color: 'var(--dm-color-status-success-text)' }}>[DONE]</span> Completed at {formatDate(download.completed_at)}</p>
            )}
            {download.error_message && (
              <p><span style={{ color: 'var(--dm-color-status-danger-text)' }}>[ERR]</span> {download.error_message}</p>
            )}
          </div>
        </div>
      )}
      {/* Bottom Actions */}
      <div className="p-4 mt-auto flex items-center gap-2" style={{ borderTop: '1px solid var(--dm-color-border-subtle)', background: 'var(--dm-color-bg-elevated)' }}>
        {isCompleted && (
          <button 
            onClick={() => onPlay && onPlay(download.id)}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, var(--dm-color-accent-primary), var(--dm-color-accent-primary-hover))', boxShadow: '0 4px 12px var(--dm-color-accent-subtle)' }}
          >
            {isMedia ? (
              <>
                <span>▶</span> Play
              </>
            ) : (
              <>
                <span>↗</span> Open File
              </>
            )}
          </button>
        )}
        <button 
          onClick={() => onReveal && onReveal(download.id)}
          className="flex-1 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all"
          style={{ background: 'var(--dm-color-bg-hover)', border: '1px solid var(--dm-color-border-subtle)', color: 'var(--dm-color-fg-primary)' }}
        >
          <span>📁</span> Open Folder
          <span className="ml-1 text-[8px]" style={{ color: 'var(--dm-color-fg-tertiary)' }}>▼</span>
        </button>
      </div>
    </aside>
  );
}
