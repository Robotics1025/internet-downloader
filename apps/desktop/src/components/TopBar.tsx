import { useState } from 'react';

interface TopBarProps {
  onAddClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeCategory: string;
}

export function TopBar({ onAddClick, searchQuery, onSearchChange, activeCategory }: TopBarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const isVideo = activeCategory === 'video';
  const searchPlaceholder = isVideo ? "Paste URL or search for videos" : "Paste URL or search for downloads";
  const addText = isVideo ? "Add Video" : "Add Download";

  return (
    <header
      id="top-bar"
      className="h-14 px-5 flex items-center gap-4 shrink-0"
      style={{
        background: '#0a0e1a',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            boxShadow: '0 0 16px rgba(34,197,94,0.3)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v8M5 7l3 3 3-3M4 12h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Download Manager</h1>
          <p className="text-[10px] leading-tight" style={{ color: '#505a6e' }}>Fast. Reliable. Effortless.</p>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl w-[340px] transition-all duration-200"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: searchFocused
            ? '1px solid rgba(59,130,246,0.4)'
            : '1px solid rgba(255,255,255,0.06)',
          boxShadow: searchFocused ? '0 0 0 3px rgba(59,130,246,0.08)' : 'none',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="#505a6e" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="#505a6e" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="flex-1 bg-transparent text-[12px] outline-none"
          style={{ color: '#e2e8f0' }}
        />
      </div>

      {/* Add Download button */}
      <button
        id="add-download-btn"
        onClick={onAddClick}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 shrink-0"
        style={{
          background: isVideo ? 'linear-gradient(135deg, #a855f7, #7e22ce)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
          color: 'white',
          boxShadow: isVideo ? '0 4px 16px rgba(168,85,247,0.25)' : '0 4px 16px rgba(34,197,94,0.25)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = isVideo ? '0 6px 24px rgba(168,85,247,0.4)' : '0 6px 24px rgba(34,197,94,0.4)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = isVideo ? '0 4px 16px rgba(168,85,247,0.25)' : '0 4px 16px rgba(34,197,94,0.25)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <span className="text-base leading-none">+</span>
        {addText}
        <span
          className="ml-0.5 w-5 h-5 rounded flex items-center justify-center text-[10px]"
          style={{ background: 'rgba(255,255,255,0.2)' }}
        >
          ▼
        </span>
      </button>

      {/* Right toolbar icons */}
      <div className="flex items-center gap-1 shrink-0 ml-1">
        {/* Settings */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="Settings"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Shuffle/Queue */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="Queue"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>

        {/* More */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="More options"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="3" cy="8" r="1.2" fill="currentColor" />
            <circle cx="8" cy="8" r="1.2" fill="currentColor" />
            <circle cx="13" cy="8" r="1.2" fill="currentColor" />
          </svg>
        </button>

        {/* Separator */}
        <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Window controls */}
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          —
        </button>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          □
        </button>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: '#505a6e' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ✕
        </button>
      </div>
    </header>
  );
}
