import { useMemo, useState } from 'react';
import { DownloadRow } from './DownloadRow';
import type { Download, ProgressSnapshot } from '../types';
import { formatBytes } from '../utils';

interface PlaylistViewProps {
  downloads: Download[];
  progress: Record<string, ProgressSnapshot | undefined>;
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  onPlay: (id: string) => void;
  onReveal: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  actioning: Record<string, boolean>;
  activeGroupId: string | null;
  onActiveGroupChange: (id: string | null) => void;
}

export interface Group {
  /** Stable key — uses uploader folder name if known, falls back to YouTube list= param */
  id: string;
  /** Human label shown on the card */
  name: string;
  /** Items in this group */
  items: Download[];
  /** First completed item's YouTube thumbnail, if any */
  thumb: string | null;
}

function youtubeIdFromUrl(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return m ? m[1] : null;
}

function ytThumb(url: string): string | null {
  const id = youtubeIdFromUrl(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

function uploaderFromSavePath(savePath: string | null | undefined): string | null {
  if (!savePath) return null;
  // Worker writes completed files to `.../Videos/<uploader>/...` — pull that out.
  const m = savePath.match(/\/Videos\/([^/]+)\/?$/) || savePath.match(/\/Music\/([^/]+)\/?$/);
  if (m && m[1] && m[1] !== 'Unknown') return m[1];
  return null;
}

function playlistIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('list');
  } catch {
    return null;
  }
}

export function buildGroups(downloads: Download[]): Group[] {
  const map = new Map<string, Group>();
  for (const d of downloads) {
    // Prefer the uploader folder (real, came from yt-dlp metadata).
    // Fall back to the YouTube list= param so playlist items group together
    // even while they're still pending and have no uploader yet.
    const uploader = uploaderFromSavePath(d.save_path);
    const playlistId = playlistIdFromUrl(d.url);
    const key = uploader ?? (playlistId ? `pl:${playlistId}` : null);
    if (!key) continue;
    const label = uploader ?? `Playlist ${playlistId?.slice(0, 8)}`;
    let g = map.get(key);
    if (!g) {
      g = { id: key, name: label, items: [], thumb: null };
      map.set(key, g);
    }
    g.items.push(d);
    if (!g.thumb) g.thumb = ytThumb(d.url);
  }
  // Order: most items first, alphabetical tiebreak.
  return [...map.values()].sort(
    (a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name),
  );
}

function totalBytes(items: Download[]): number {
  return items.reduce((sum, d) => sum + (d.total_size ?? d.downloaded_size ?? 0), 0);
}

export function PlaylistView({
  downloads, progress, onStart, onDelete, onPlay, onReveal, onSelect, selectedId, actioning,
  activeGroupId, onActiveGroupChange,
}: PlaylistViewProps) {
  const [customNames, setCustomNames] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dm_playlist_names') || '{}');
    } catch {
      return {};
    }
  });
  // Per-download playlist override: downloadId → targetGroupId. Lets the user
  // drag/menu items from one playlist into another without moving files on disk.
  const [customAssignments, setCustomAssignments] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('dm_playlist_assignments') || '{}');
    } catch {
      return {};
    }
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const groups = useMemo(() => {
    const gs = buildGroups(downloads);
    for (const g of gs) {
      if (customNames[g.id]) g.name = customNames[g.id];
    }
    // Apply custom assignments — move items between groups per localStorage.
    if (Object.keys(customAssignments).length > 0) {
      const byId = new Map(gs.map(g => [g.id, g] as const));
      for (const g of gs) {
        g.items = g.items.filter(item => {
          const target = customAssignments[item.id];
          if (!target || target === g.id) return true;
          const dest = byId.get(target);
          if (!dest) return true;  // target playlist no longer exists; keep original
          dest.items.push(item);
          if (!dest.thumb) dest.thumb = g.thumb;
          return false;
        });
      }
    }
    return gs;
  }, [downloads, customNames, customAssignments]);

  const handleRename = (id: string, newName: string) => {
    const updated = { ...customNames, [id]: newName.trim() };
    if (!updated[id]) delete updated[id];
    setCustomNames(updated);
    localStorage.setItem('dm_playlist_names', JSON.stringify(updated));
    setEditingId(null);
  };

  const handleMoveToPlaylist = (downloadId: string, targetGroupId: string) => {
    const updated = { ...customAssignments, [downloadId]: targetGroupId };
    setCustomAssignments(updated);
    localStorage.setItem('dm_playlist_assignments', JSON.stringify(updated));
  };

  // Default-select the first group when one becomes available.
  const effectiveActive = activeGroupId && groups.some(g => g.id === activeGroupId)
    ? activeGroupId
    : groups[0]?.id ?? null;
  const active = groups.find(g => g.id === effectiveActive) ?? null;

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-2xl"
          style={{ background: 'var(--dm-color-accent-subtle)', color: 'var(--dm-color-accent-primary)' }}
        >
          ▦
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--dm-color-fg-primary)' }}>No playlists or artists yet</p>
        <p className="text-xs mt-1.5 max-w-sm" style={{ color: 'var(--dm-color-fg-secondary)' }}>
          Paste a YouTube playlist URL (one with <code style={{ color: 'var(--dm-color-fg-primary)' }}>?list=</code>) or
          download videos from the same channel — they'll be grouped here automatically.
        </p>
      </div>
    );
  }

  const completedCount = active ? active.items.filter(i => i.status === 'completed').length : 0;
  const totalSize = active ? totalBytes(active.items) : 0;

  return (
    <div className="flex flex-col p-6 h-full overflow-y-auto" style={{ gap: '20px' }}>
      {/* Hero: currently-selected group */}
      {active && (
        <div className="flex gap-6 items-center shrink-0">
          <div
            className="w-44 h-44 rounded-2xl shrink-0 relative overflow-hidden"
            style={{
              background: active.thumb
                ? `center / cover no-repeat url(${active.thumb})`
                : 'linear-gradient(135deg, var(--dm-color-accent-primary), var(--dm-color-accent-primary-hover))',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            {!active.thumb && (
              <div className="absolute inset-0 flex items-center justify-center text-5xl text-white/80">▦</div>
            )}
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            {editingId === active.id ? (
              <input
                type="text"
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleRename(active.id, editValue || active.name)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename(active.id, editValue || active.name);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="text-2xl font-bold bg-transparent outline-none w-full"
                style={{
                  color: 'var(--dm-color-fg-primary)',
                  borderBottom: '2px solid var(--dm-color-accent-primary)',
                }}
              />
            ) : (
              <h1
                className="text-2xl font-bold truncate cursor-pointer transition-opacity"
                style={{ color: 'var(--dm-color-fg-primary)' }}
                onClick={() => {
                  setEditingId(active.id);
                  setEditValue(active.name);
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                title="Click to rename playlist"
              >
                {active.name}
              </h1>
            )}
            <div className="flex items-center gap-2 text-sm mt-1 mb-4" style={{ color: 'var(--dm-color-fg-secondary)' }}>
              <span>{active.items.length} {active.items.length === 1 ? 'video' : 'videos'}</span>
              <span>•</span>
              <span>{completedCount} completed</span>
              <span>•</span>
              <span>{formatBytes(totalSize)}</span>
            </div>

            <div className="flex items-center gap-3">
              {(() => {
                const firstCompleted = active.items.find(i => i.status === 'completed');
                return (
                  <button
                    onClick={() => firstCompleted && onPlay(firstCompleted.id)}
                    disabled={!firstCompleted}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all"
                    style={{
                      background: firstCompleted ? 'var(--dm-color-accent-primary)' : 'var(--dm-color-accent-subtle)',
                      color: 'white',
                      boxShadow: firstCompleted ? '0 4px 14px rgba(99,102,241,0.39)' : 'none',
                      cursor: firstCompleted ? 'pointer' : 'not-allowed',
                    }}
                  >
                    ▶ Play All
                  </button>
                );
              })()}
              <button
                onClick={() => {
                  // Reveal the folder of the first completed item.
                  const c = active.items.find(i => i.status === 'completed');
                  if (c) onReveal(c.id);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm"
                style={{ background: 'var(--dm-color-bg-hover)', color: 'var(--dm-color-fg-primary)', border: '1px solid var(--dm-color-border-subtle)' }}
              >
                📁 Open Folder
              </button>
              <button
                onClick={() => {
                  const count = active.items.length;
                  if (!confirm(
                    `Delete the "${active.name}" playlist and all ${count} of its videos?\n\nThis removes the files from disk and cannot be undone.`,
                  )) return;
                  // Fire-and-forget: parent's onDelete handles API + state.
                  for (const item of active.items) {
                    onDelete(item.id);
                  }
                  // Clean up any localStorage overrides pointing at this playlist.
                  setCustomNames(prev => {
                    if (!(active.id in prev)) return prev;
                    const next = { ...prev }; delete next[active.id];
                    localStorage.setItem('dm_playlist_names', JSON.stringify(next));
                    return next;
                  });
                  setCustomAssignments(prev => {
                    const next = Object.fromEntries(
                      Object.entries(prev).filter(([, target]) => target !== active.id),
                    );
                    localStorage.setItem('dm_playlist_assignments', JSON.stringify(next));
                    return next;
                  });
                  onActiveGroupChange(null);
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm"
                style={{
                  background: 'transparent',
                  color: 'var(--dm-color-status-danger-text)',
                  border: '1px solid var(--dm-color-status-danger-text)',
                }}
                title="Delete playlist and all its videos"
              >
                🗑 Delete Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Horizontal group strip — shrink-0 on container AND children so the
          video table below can't compress this row, and the cards keep their
          intrinsic 210px width inside the horizontal-scroll container. */}
      <div
        className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 shrink-0"
        style={{ scrollbarWidth: 'thin' }}
      >
        {groups.map(g => {
          const isActive = effectiveActive === g.id;
          return (
            <button
              key={g.id}
              onClick={() => onActiveGroupChange(g.id)}
              className="flex items-center gap-3 p-2 rounded-2xl text-left transition-all shrink-0"
              style={{
                width: 220,
                minHeight: 76,
                background: isActive ? 'var(--dm-color-accent-subtle)' : 'var(--dm-color-bg-hover)',
                border: isActive ? '1px solid var(--dm-color-accent-primary)' : '1px solid var(--dm-color-border-subtle)',
              }}
            >
              <div
                className="w-14 h-14 rounded-xl shrink-0"
                style={{
                  background: g.thumb
                    ? `center / cover no-repeat url(${g.thumb})`
                    : 'linear-gradient(135deg, var(--dm-color-accent-primary), var(--dm-color-accent-primary-hover))',
                }}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold truncate" style={{ color: 'var(--dm-color-fg-primary)' }}>{g.name}</span>
                <span className="text-[11px] mt-0.5" style={{ color: 'var(--dm-color-fg-secondary)' }}>
                  {g.items.length} {g.items.length === 1 ? 'video' : 'videos'}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--dm-color-fg-tertiary)' }}>
                  {formatBytes(totalBytes(g.items))}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Items in the active group */}
      <div className="flex flex-col">
        <div
          className="flex items-center px-4 py-2 text-xs font-semibold mb-1"
          style={{ color: 'var(--dm-color-fg-tertiary)', borderBottom: '1px solid var(--dm-color-border-subtle)' }}
        >
          <div className="w-8">#</div>
          <div className="flex-1">TITLE</div>
          <div className="w-24 text-right">DURATION</div>
          <div className="w-32 text-center">RESOLUTION</div>
          <div className="w-24 text-right">SIZE</div>
          <div className="w-32 text-center">STATUS</div>
          <div className="w-12" />
        </div>

        {active && active.items.length > 0 ? (
          active.items.map((d, index) => (
            <DownloadRow
              key={d.id}
              download={d}
              progress={progress[d.id]}
              onStart={onStart}
              onDelete={onDelete}
              onPlay={onPlay}
              onReveal={onReveal}
              onSelect={onSelect}
              isSelected={selectedId === d.id}
              actionLoading={actioning[d.id] || false}
              index={index + 1}
              variant="playlist"
              playlistOptions={groups
                .filter(g => g.id !== (effectiveActive ?? ''))
                .map(g => ({ id: g.id, name: g.name }))}
              onMoveToPlaylist={handleMoveToPlaylist}
            />
          ))
        ) : (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--dm-color-fg-tertiary)' }}>
            Nothing in this group yet.
          </div>
        )}
      </div>
    </div>
  );
}
