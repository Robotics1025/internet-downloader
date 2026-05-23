

interface SidebarProps {
  activeFilter: string;
  onFilterChange: (f: string) => void;
  counts: Record<string, number>;
}

const FILTERS: { key: string; label: string; icon: string }[] = [
  { key: 'all',         label: 'All Downloads', icon: '≡' },
  { key: 'downloading', label: 'Downloading',   icon: '↓' },
  { key: 'completed',   label: 'Completed',     icon: '✓' },
  { key: 'paused',      label: 'Paused',        icon: '⏸' },
  { key: 'failed',      label: 'Failed',        icon: '✕' },
  { key: 'pending',     label: 'Pending',       icon: '…' },
];

const STATUS_COLORS: Record<string, string> = {
  all: '#6366f1',
  downloading: '#6366f1',
  completed: '#22d3ee',
  paused: '#facc15',
  failed: '#f87171',
  pending: '#94a3b8',
};

export function Sidebar({ activeFilter, onFilterChange, counts }: SidebarProps) {
  return (
    <aside className="flex flex-col h-full w-52 shrink-0 py-5 px-3"
      style={{ background: '#0f0f17', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 mb-7">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg font-black"
          style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)', boxShadow: '0 0 16px rgba(99,102,241,0.4)' }}>
          ↓
        </div>
        <div>
          <div className="text-sm font-bold text-white">DownloadMgr</div>
          <div className="text-xs" style={{ color: '#475569' }}>v0.2.0</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-widest px-3 mb-2" style={{ color: '#334155' }}>Queue</p>
        {FILTERS.map(({ key, label, icon }) => {
          const isActive = activeFilter === key;
          const color = STATUS_COLORS[key];
          const count = counts[key] ?? 0;
          return (
            <button key={key} onClick={() => onFilterChange(key)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all"
              style={{
                background: isActive ? `${color}18` : 'transparent',
                color: isActive ? color : '#64748b',
                fontWeight: isActive ? 600 : 400,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
              <span className="flex items-center gap-2.5">
                <span className="w-4 text-center text-xs" style={{ color: isActive ? color : '#475569' }}>{icon}</span>
                {label}
              </span>
              {count > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-md tabular-nums"
                  style={{ background: isActive ? `${color}28` : 'rgba(255,255,255,0.06)', color: isActive ? color : '#475569' }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom hint */}
      <div className="px-3 mt-4">
        <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.15)' }}>
          <div className="font-semibold mb-1">💡 Tip</div>
          <div style={{ color: '#64748b' }}>Paste any direct URL to add a download instantly.</div>
        </div>
      </div>
    </aside>
  );
}
