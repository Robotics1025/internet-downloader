import { useState } from 'react';

interface SidebarProps {
  activeFilter: string;
  onFilterChange: (f: string) => void;
  counts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

const STATUS_FILTERS: { key: string; label: string; icon: string }[] = [
  { key: 'all',         label: 'Downloads',   icon: '↓' },
  { key: 'downloading', label: 'Active',      icon: '▶' },
  { key: 'paused',      label: 'Paused',      icon: '⏸' },
  { key: 'completed',   label: 'Completed',   icon: '✓' },
  { key: 'failed',      label: 'Failed',      icon: '✕' },
];

const CATEGORIES: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'cat:all',        label: 'All Files',    icon: '📁', color: '#8892a8' },
  { key: 'cat:video',      label: 'Video',        icon: '▶',  color: '#8b5cf6' },
  { key: 'cat:document',   label: 'Documents',    icon: '📄', color: '#3b82f6' },
  { key: 'cat:compressed', label: 'Compressed',   icon: '⧈',  color: '#a855f7' },
  { key: 'cat:audio',      label: 'Audio',        icon: '♪',  color: '#ec4899' },
  { key: 'cat:image',      label: 'Images',       icon: '🖼', color: '#06b6d4' },
  { key: 'cat:software',   label: 'Software',     icon: '⚙',  color: '#14b8a6' },
  { key: 'cat:other',      label: 'Others',       icon: '•',  color: '#6b7280' },
];

const STATUS_COLORS: Record<string, string> = {
  all: '#3b82f6',
  downloading: '#3b82f6',
  completed: '#22c55e',
  paused: '#f59e0b',
  failed: '#ef4444',
  pending: '#6b7280',
};

const NAV_ITEMS: { label: string; icon: string }[] = [
  { label: 'Scheduler',         icon: '📅' },
  { label: 'Browser Extension', icon: '🌐' },
  { label: 'Settings',          icon: '⚙' },
];

export function Sidebar({ activeFilter, onFilterChange, counts, categoryCounts }: SidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const allCatCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  function renderStatusRow(key: string, label: string, icon: string, color: string, count: number) {
    const isActive = activeFilter === key;
    const isHovered = hoveredItem === key;
    return (
      <button
        key={key}
        id={`sidebar-filter-${key}`}
        onClick={() => onFilterChange(key)}
        onMouseEnter={() => setHoveredItem(key)}
        onMouseLeave={() => setHoveredItem(null)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-all duration-200"
        style={{
          background: isActive
            ? `linear-gradient(135deg, ${color}18, ${color}0a)`
            : isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          color: isActive ? '#e2e8f0' : '#8892a8',
          fontWeight: isActive ? 600 : 400,
          borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-5 text-center text-xs shrink-0"
            style={{ color: isActive ? color : '#505a6e' }}
          >
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </span>
        <span
          className="text-[11px] min-w-[22px] text-center px-1.5 py-0.5 rounded-md tabular-nums shrink-0 font-medium"
          style={{
            color: isActive ? color : '#505a6e',
          }}
        >
          {count}
        </span>
      </button>
    );
  }

  function renderCategoryRow(key: string, label: string, icon: string, color: string, count: number) {
    const isActive = activeFilter === key;
    const isHovered = hoveredItem === key;
    return (
      <button
        key={key}
        id={`sidebar-cat-${key}`}
        onClick={() => onFilterChange(key)}
        onMouseEnter={() => setHoveredItem(key)}
        onMouseLeave={() => setHoveredItem(null)}
        className="w-full flex items-center justify-between px-3 py-[7px] rounded-lg text-[13px] transition-all duration-200"
        style={{
          background: isActive
            ? 'rgba(139, 92, 246, 0.15)'
            : isHovered ? 'rgba(255,255,255,0.02)' : 'transparent',
          color: isActive ? '#e2e8f0' : '#8892a8',
          fontWeight: isActive ? 500 : 400,
          border: isActive ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent'
        }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-5 h-5 rounded flex items-center justify-center text-[11px] shrink-0"
            style={{
              background: isActive ? '#8b5cf6' : `${color}18`,
              color: isActive ? '#ffffff' : color,
            }}
          >
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </span>
        <span
          className="text-[11px] tabular-nums shrink-0 font-medium"
          style={{ color: isActive ? '#a78bfa' : '#505a6e' }}
        >
          {count}
        </span>
      </button>
    );
  }

  return (
    <aside
      id="sidebar"
      className="flex flex-col h-full w-[200px] shrink-0 overflow-y-auto"
      style={{
        background: '#0a0e1a',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Status filters */}
      <nav className="px-2 pt-2 pb-1 space-y-0.5">
        {STATUS_FILTERS.map(({ key, label, icon }) =>
          renderStatusRow(key, label, icon, STATUS_COLORS[key] ?? '#6b7280', counts[key] ?? 0),
        )}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

      {/* Categories header */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] px-5 mb-1.5" style={{ color: '#505a6e' }}>
        Categories
      </p>

      <nav className="flex-1 px-2 space-y-0.5 min-h-0">
        {CATEGORIES.map(({ key, label, icon, color }) => {
          let count = 0;
          if (key === 'cat:all') {
            count = allCatCount;
          } else {
            count = categoryCounts[key.replace('cat:', '')] ?? 0;
          }
          return renderCategoryRow(key, label, icon, color, count);
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

      {/* Nav items */}
      <nav className="px-2 pb-2 space-y-0.5">
        {NAV_ITEMS.map(({ label, icon }) => (
          <button
            key={label}
            onMouseEnter={() => setHoveredItem(`nav-${label}`)}
            onMouseLeave={() => setHoveredItem(null)}
            className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-all duration-200"
            style={{
              color: '#8892a8',
              background: hoveredItem === `nav-${label}` ? 'rgba(255,255,255,0.03)' : 'transparent',
            }}
          >
            <span className="w-5 text-center text-xs shrink-0" style={{ color: '#505a6e' }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Browser extension promo */}
      <div className="px-3 pb-4 shrink-0">
        <div
          className="rounded-xl p-3"
          style={{
            background: 'linear-gradient(135deg, rgba(88,28,135,0.4), rgba(76,29,149,0.1))',
            border: '1px solid rgba(139,92,246,0.15)',
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-7 h-7 rounded-full bg-white flex items-center justify-center overflow-hidden"
            >
              <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg" alt="Chrome" className="w-5 h-5" />
            </div>
            <span className="text-[13px] font-semibold text-white">Add our extension</span>
          </div>
          <p className="text-[11px] mb-3" style={{ color: '#a0aec0' }}>
            Download from any website with one click.
          </p>
          <button
            className="w-full text-[11px] font-medium py-1.5 rounded-lg transition-all"
            style={{
              background: 'transparent',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            Install Extension ↗
          </button>
        </div>
      </div>
    </aside>
  );
}
