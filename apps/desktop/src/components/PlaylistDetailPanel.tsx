import type { Group } from './PlaylistView';
import { formatBytes } from '../utils';

interface PlaylistDetailPanelProps {
  group: Group | null;
  onClose: () => void;
  onPlayAll: () => void;
  onShuffle: () => void;
  onOpenFolder: () => void;
}

function formatDateTime(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  };
}

export function PlaylistDetailPanel({
  group, onClose, onPlayAll, onShuffle, onOpenFolder,
}: PlaylistDetailPanelProps) {
  if (!group) {
    return (
      <aside
        className="w-[340px] h-full flex flex-col shrink-0 border-l"
        style={{ background: '#0a0e1a', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="p-6 text-center" style={{ color: '#505a6e' }}>
          <div
            className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center text-xl mb-3"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            ▦
          </div>
          <p className="text-xs">Select a playlist or artist to see details.</p>
        </div>
      </aside>
    );
  }

  const completedItems = group.items.filter(i => i.status === 'completed');
  const totalSize = group.items.reduce(
    (sum, i) => sum + (i.total_size ?? i.downloaded_size ?? 0),
    0,
  );
  const lastPlayed = group.items
    .map(i => i.completed_at)
    .filter((s): s is string => !!s)
    .sort()
    .pop() ?? null;
  const lastPlayedFmt = formatDateTime(lastPlayed);
  const created = group.items.map(i => i.created_at).filter(Boolean).sort()[0];
  const createdFmt = formatDateTime(created);

  const location = group.items[0]?.save_path ?? '—';
  const lastItem = completedItems[completedItems.length - 1];

  return (
    <aside
      className="w-[340px] h-full flex flex-col shrink-0 border-l overflow-y-auto"
      style={{ background: '#0a0e1a', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-between p-5 pb-3">
        <h2 className="text-lg font-semibold text-white truncate pr-4">{group.name}</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: '#8892a8', background: 'rgba(255,255,255,0.03)' }}
        >
          ✕
        </button>
      </div>

      {/* Cover */}
      <div className="px-5 mb-5">
        <div
          className="w-full aspect-video rounded-xl relative overflow-hidden"
          style={{
            background: group.thumb
              ? `center / cover no-repeat url(${group.thumb})`
              : 'linear-gradient(135deg,#6366f1,#a855f7)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {!group.thumb && (
            <div className="absolute inset-0 flex items-center justify-center text-4xl text-white/80">
              ▦
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 flex flex-col gap-3 mb-5 text-sm" style={{ color: '#a0aec0' }}>
        <Row icon="▶" label="Total Videos" value={String(group.items.length)} />
        <Row icon="⇣" label="Total Size" value={formatBytes(totalSize)} />
        <Row icon="✓" label="Completed" value={`${completedItems.length} / ${group.items.length}`} />
        {lastPlayedFmt && lastItem && (
          <div className="flex justify-between py-1">
            <div className="flex items-center gap-2 shrink-0" style={{ color: '#a0aec0' }}>
              <span className="w-4 text-center">↻</span> Last Completed
            </div>
            <div className="text-right flex flex-col items-end min-w-0">
              <span className="text-white font-medium truncate max-w-[160px]" title={lastItem.file_name}>
                {lastItem.file_name}
              </span>
              <span className="text-[11px]" style={{ color: '#8892a8' }}>{lastPlayedFmt.date}</span>
            </div>
          </div>
        )}
      </div>

      <div className="w-full h-px mb-5" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Info */}
      <div className="px-5 flex flex-col gap-2.5 mb-6 text-[12px]" style={{ color: '#8892a8' }}>
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-2 shrink-0"><span className="w-4 text-center">📁</span> Location</div>
          <div className="truncate text-right" title={location} style={{ color: '#cbd5e1' }}>
            {location}
          </div>
        </div>
        {createdFmt && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2"><span className="w-4 text-center">📅</span> Created</div>
            <div style={{ color: '#cbd5e1' }}>{createdFmt.date}</div>
          </div>
        )}
        {lastPlayedFmt && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2"><span className="w-4 text-center">🕒</span> Updated</div>
            <div style={{ color: '#cbd5e1' }}>{lastPlayedFmt.date} · {lastPlayedFmt.time}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 flex flex-col gap-3 pb-6 mt-auto">
        <button
          onClick={onPlayAll}
          disabled={completedItems.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all"
          style={{
            background: completedItems.length
              ? 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
              : 'rgba(99,102,241,0.25)',
            color: 'white',
            cursor: completedItems.length ? 'pointer' : 'not-allowed',
            boxShadow: completedItems.length ? '0 4px 14px rgba(139, 92, 246, 0.3)' : 'none',
          }}
        >
          ▶ Play All
        </button>
        <div className="flex gap-3">
          <button
            onClick={onShuffle}
            disabled={completedItems.length === 0}
            className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: completedItems.length ? '#e2e8f0' : '#505a6e',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: completedItems.length ? 'pointer' : 'not-allowed',
            }}
          >
            ⤭ Shuffle
          </button>
          <button
            onClick={onOpenFolder}
            className="flex-1 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            📁 Open Folder
          </button>
        </div>
      </div>
    </aside>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <div className="flex items-center gap-2" style={{ color: '#a0aec0' }}>
        <span className="w-4 text-center">{icon}</span> {label}
      </div>
      <div className="text-white font-medium">{value}</div>
    </div>
  );
}
