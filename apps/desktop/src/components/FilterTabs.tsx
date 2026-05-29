import { useState } from 'react';

interface FilterTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  counts: Record<string, number>;
  activeCategory: string;
  onSearchToggle?: () => void;
  onSortToggle?: () => void;
  onViewToggle?: () => void;
}

const DEFAULT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'downloading', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

const VIDEO_TABS = [
  { key: 'all', label: 'All Videos' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'artists', label: 'Artists' },
  { key: 'recent', label: 'Recently Played' },
  { key: 'downloaded', label: 'Downloaded' },
];

export function FilterTabs({ activeTab, onTabChange, counts, activeCategory }: FilterTabsProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const tabsToRender = activeCategory === 'video' ? VIDEO_TABS : DEFAULT_TABS;

  return (
    <div
      id="filter-tabs"
      className="flex items-center px-5 gap-0 shrink-0"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0f1423',
      }}
    >
      {/* Tabs */}
      <div className="flex items-center gap-0.5 flex-1">
        {tabsToRender.map(({ key, label }) => {
          const isActive = activeTab === key || (activeTab.startsWith('cat:') && key === 'all');
          const isHovered = hoveredTab === key;
          const count = counts[key] ?? 0;

          return (
            <button
              key={key}
              id={`tab-${key}`}
              onClick={() => onTabChange(key)}
              onMouseEnter={() => setHoveredTab(key)}
              onMouseLeave={() => setHoveredTab(null)}
              className="relative px-3.5 py-2.5 text-[12px] font-medium transition-all duration-200 flex items-center gap-1.5"
              style={{
                color: isActive ? '#e2e8f0' : isHovered ? '#8892a8' : '#505a6e',
                background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderRadius: '8px 8px 0 0',
              }}
            >
              {label}
              <span
                className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-md font-medium"
                style={{
                  background: isActive ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#3b82f6' : '#505a6e',
                }}
              >
                {key === 'all' ? counts['all'] ?? 0 : count}
              </span>
              {isActive && (
                <div
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ background: '#3b82f6' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Right toolbar */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Search */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="Search in list"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        {/* Filter */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="Sort & filter"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        {/* Grid view */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="Grid view"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
