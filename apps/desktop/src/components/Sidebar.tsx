import React, { useState } from 'react';

interface SidebarProps {
  activeFilter: string;
  onFilterChange: (f: string) => void;
  counts: Record<string, number>;
  categoryCounts: Record<string, number>;
  onSettingsClick?: () => void;
}

// Minimal inline SVG icons — 16×16 viewBox, stroke-based
function IconDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M5 7l3 3 3-3" />
      <path d="M2 12h12" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5,3 13,8 5,13" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="4" y="3" width="2.5" height="10" rx="1" fill="currentColor" stroke="none" />
      <rect x="9.5" y="3" width="2.5" height="10" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8l2 2 3-3" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M6 6l4 4M10 6l-4 4" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" />
    </svg>
  );
}
function IconVideo() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="10" height="8" rx="1.5" />
      <path d="M11 7l4-2v6l-4-2V7z" />
    </svg>
  );
}
function IconFileText() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6l-4-4z" />
      <path d="M9 2v4h4" />
      <path d="M5.5 9.5h5M5.5 11.5h3" />
    </svg>
  );
}
function IconArchive() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" />
      <path d="M6.5 9.5h3" />
    </svg>
  );
}
function IconMusic() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 13V4l7-2v9" />
      <circle cx="4.5" cy="13" r="1.5" />
      <circle cx="11.5" cy="11" r="1.5" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="5.5" cy="6.5" r="1" />
      <path d="M2 11l3.5-3 3 3 2-2 3 2" />
    </svg>
  );
}
function IconPackage() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5.5L8 3 3 5.5v5L8 13l5-2.5v-5z" />
      <path d="M8 3v10M3 5.5l5 2.5 5-2.5" />
    </svg>
  );
}
function IconDots() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3.5" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="8" cy="12.5" r="1.3" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M5 2v2M11 2v2M2 7h12" />
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2c-2 2-2 8 0 12M8 2c2 2 2 8 0 12" />
      <path d="M2.5 6h11M2.5 10h11" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  );
}
function IconArrowDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v8M5 8l3 3 3-3" />
    </svg>
  );
}

type NavRowIconType = () => React.ReactElement;

const STATUS_FILTERS: { key: string; label: string; Icon: NavRowIconType }[] = [
  { key: 'all',         label: 'All Downloads', Icon: IconDownload },
  { key: 'downloading', label: 'Active',         Icon: IconPlay },
  { key: 'paused',      label: 'Paused',         Icon: IconPause },
  { key: 'completed',   label: 'Completed',      Icon: IconCheck },
  { key: 'failed',      label: 'Failed',          Icon: IconX },
];

const CATEGORIES: { key: string; label: string; Icon: NavRowIconType }[] = [
  { key: 'cat:all',        label: 'All Files',   Icon: IconFolder },
  { key: 'cat:video',      label: 'Video',       Icon: IconVideo },
  { key: 'cat:document',   label: 'Documents',   Icon: IconFileText },
  { key: 'cat:compressed', label: 'Compressed',  Icon: IconArchive },
  { key: 'cat:audio',      label: 'Audio',       Icon: IconMusic },
  { key: 'cat:image',      label: 'Images',      Icon: IconImage },
  { key: 'cat:software',   label: 'Software',    Icon: IconPackage },
  { key: 'cat:other',      label: 'Others',      Icon: IconDots },
];

const NAV_ITEMS: { label: string; Icon: NavRowIconType }[] = [
  { label: 'Scheduler',         Icon: IconCalendar },
  { label: 'Browser Extension', Icon: IconGlobe },
  { label: 'Settings',          Icon: IconSettings },
];

export function Sidebar({ activeFilter, onFilterChange, counts, categoryCounts, onSettingsClick }: SidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const allCatCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  function NavRow({
    id,
    label,
    Icon,
    count,
    onClick,
  }: {
    id: string;
    label: string;
    Icon: NavRowIconType;
    count?: number;
    onClick?: () => void;
  }) {
    const isActive = activeFilter === id;
    const isHovered = hoveredItem === id;

    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHoveredItem(id)}
        onMouseLeave={() => setHoveredItem(null)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '32px',
          padding: '0 10px',
          paddingLeft: isActive ? '10px' : '12px',
          borderRadius: 'var(--dm-radius-md)',
          background: isActive
            ? 'var(--dm-color-bg-selected)'
            : isHovered
            ? 'var(--dm-color-bg-hover)'
            : 'transparent',
          borderLeft: isActive
            ? '2px solid var(--dm-color-accent-primary)'
            : '2px solid transparent',
          color: isActive
            ? 'var(--dm-color-fg-primary)'
            : 'var(--dm-color-fg-secondary)',
          fontSize: 'var(--dm-text-sm)',
          fontWeight: isActive ? 'var(--dm-weight-medium)' : 'var(--dm-weight-regular)',
          lineHeight: 'var(--dm-leading-tight)',
          cursor: 'pointer',
          outline: 'none',
          transition: `background var(--dm-duration-fast) var(--dm-easing-standard),
                       color var(--dm-duration-fast) var(--dm-easing-standard)`,
          textAlign: 'left',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
            color: isActive
              ? 'var(--dm-color-accent-primary)'
              : 'var(--dm-color-fg-tertiary)',
          }}
        >
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <Icon />
          </span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: isActive
                ? 'var(--dm-color-fg-primary)'
                : 'var(--dm-color-fg-secondary)',
            }}
          >
            {label}
          </span>
        </span>

        {count !== undefined && (
          <span
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '20px',
              height: '18px',
              padding: '0 5px',
              borderRadius: 'var(--dm-radius-full)',
              background: 'var(--dm-color-bg-recessed)',
              color: 'var(--dm-color-fg-tertiary)',
              fontSize: 'var(--dm-text-xs)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              marginLeft: '6px',
            }}
          >
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      id="sidebar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '220px',
        flexShrink: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--dm-color-bg-app)',
        borderRight: '1px solid var(--dm-color-border-subtle)',
      }}
    >


      {/* Status filters */}
      <nav
        style={{ padding: '8px 6px 4px', display: 'flex', flexDirection: 'column', gap: '1px' }}
        aria-label="Download status filters"
      >
        {STATUS_FILTERS.map(({ key, label, Icon }) => (
          <NavRow
            key={key}
            id={key}
            label={label}
            Icon={Icon}
            count={counts[key] ?? 0}
            onClick={() => onFilterChange(key)}
          />
        ))}
      </nav>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          background: 'var(--dm-color-border-subtle)',
          margin: '6px 12px',
          flexShrink: 0,
        }}
      />

      {/* Categories section */}
      <div
        style={{
          padding: '2px 6px 4px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1px',
          minHeight: 0,
        }}
      >
        <p
          style={{
            fontSize: '10px',
            fontWeight: 'var(--dm-weight-semibold)',
            color: 'var(--dm-color-fg-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--dm-tracking-widest)',
            lineHeight: 1,
            padding: '4px 10px 6px',
            margin: 0,
          }}
        >
          Categories
        </p>
        {CATEGORIES.map(({ key, label, Icon }) => {
          const count =
            key === 'cat:all'
              ? allCatCount
              : categoryCounts[key.replace('cat:', '')] ?? 0;
          return (
            <NavRow
              key={key}
              id={key}
              label={label}
              Icon={Icon}
              count={count}
              onClick={() => onFilterChange(key)}
            />
          );
        })}
      </div>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          background: 'var(--dm-color-border-subtle)',
          margin: '6px 12px',
          flexShrink: 0,
        }}
      />

      {/* Utility nav */}
      <nav
        style={{ padding: '0 6px 8px', display: 'flex', flexDirection: 'column', gap: '1px' }}
        aria-label="Utility navigation"
      >
        {NAV_ITEMS.map(({ label, Icon }) => (
          <NavRow
            key={label}
            id={`nav-${label}`}
            label={label}
            Icon={Icon}
            onClick={label === 'Settings' ? onSettingsClick : undefined}
          />
        ))}
      </nav>

      {/* Extension promo card */}
      <div style={{ padding: '0 10px 12px', flexShrink: 0 }}>
        <div
          style={{
            borderRadius: 'var(--dm-radius-lg)',
            padding: '10px 12px',
            background: 'var(--dm-color-accent-subtle)',
            border: '1px solid rgba(124, 106, 247, 0.20)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
            }}
          >
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Chrome_icon_%28February_2022%29.svg"
                alt="Chrome"
                style={{ width: '16px', height: '16px' }}
              />
            </div>
            <span
              style={{
                fontSize: 'var(--dm-text-sm)',
                fontWeight: 'var(--dm-weight-semibold)',
                color: 'var(--dm-color-fg-primary)',
                lineHeight: 'var(--dm-leading-tight)',
              }}
            >
              Add our extension
            </span>
          </div>
          <p
            style={{
              fontSize: 'var(--dm-text-xs)',
              color: 'var(--dm-color-fg-secondary)',
              lineHeight: '1.4',
              margin: '0 0 8px',
            }}
          >
            Download from any website with one click.
          </p>
          <button
            style={{
              width: '100%',
              fontSize: 'var(--dm-text-xs)',
              fontWeight: 'var(--dm-weight-medium)',
              padding: '5px 0',
              borderRadius: 'var(--dm-radius-sm)',
              background: 'transparent',
              color: 'var(--dm-color-fg-secondary)',
              border: '1px solid var(--dm-color-border-default)',
              cursor: 'pointer',
              transition: `background var(--dm-duration-fast) var(--dm-easing-standard),
                           color var(--dm-duration-fast) var(--dm-easing-standard)`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--dm-color-bg-hover)';
              e.currentTarget.style.color = 'var(--dm-color-fg-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--dm-color-fg-secondary)';
            }}
          >
            Install Extension ↗
          </button>
        </div>
      </div>
    </aside>
  );
}
