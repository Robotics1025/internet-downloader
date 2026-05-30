import { useState } from 'react';
import type { ReactNode } from 'react';

interface TopBarProps {
  onAddClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeCategory: string;
  themeSwitcher?: ReactNode;
}

export function TopBar({ onAddClick, searchQuery, onSearchChange, activeCategory, themeSwitcher }: TopBarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const isVideo = activeCategory === 'video';
  const searchPlaceholder = isVideo ? "Paste URL or search for videos" : "Paste URL or search for downloads";
  const addText = isVideo ? "Add Video" : "Add Download";

  return (
    <header
      id="top-bar"
      className="h-14 px-5 flex items-center gap-4 shrink-0"
      style={{
        background: 'var(--dm-color-bg-app)',
        borderBottom: '1px solid var(--dm-color-border-subtle)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
          style={{
            background: 'var(--dm-color-bg-recessed)',
            boxShadow: '0 0 16px var(--dm-color-accent-subtle)',
          }}
        >
          <img src="/logo.png" alt="DownloadMgr Logo" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight" style={{ color: 'var(--dm-color-fg-primary)' }}>Download Manager</h1>
          <p className="text-[10px] leading-tight" style={{ color: 'var(--dm-color-fg-tertiary)' }}>Fast. Reliable. Effortless.</p>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl w-[340px] transition-all duration-200"
        style={{
          background: 'var(--dm-color-bg-hover)',
          border: searchFocused
            ? '1px solid var(--dm-color-border-focus)'
            : '1px solid var(--dm-color-border-subtle)',
          boxShadow: searchFocused ? '0 0 0 3px rgba(124,106,247,0.08)' : 'none',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="var(--dm-color-fg-tertiary)" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="var(--dm-color-fg-tertiary)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="flex-1 bg-transparent text-[12px] outline-none"
          style={{ color: 'var(--dm-color-fg-primary)' }}
        />
      </div>

      {/* Add Download button */}
      <button
        id="add-download-btn"
        onClick={onAddClick}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 shrink-0"
        style={{
          background: 'linear-gradient(135deg, var(--dm-color-accent-primary), var(--dm-color-accent-primary-hover))',
          color: 'white',
          boxShadow: '0 4px 16px var(--dm-color-accent-subtle)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.filter = 'brightness(1.1)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 6px 24px var(--dm-color-accent-subtle)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.filter = 'brightness(1)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 16px var(--dm-color-accent-subtle)';
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
        {themeSwitcher && (
          <>
            {themeSwitcher}
            <div className="w-px h-5 mx-1" style={{ background: 'var(--dm-color-border-default)' }} />
          </>
        )}

        {/* Window controls */}
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: 'var(--dm-color-fg-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--dm-color-bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          —
        </button>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: 'var(--dm-color-fg-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--dm-color-bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          □
        </button>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all"
          style={{ color: 'var(--dm-color-fg-tertiary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ✕
        </button>
      </div>
    </header>
  );
}
