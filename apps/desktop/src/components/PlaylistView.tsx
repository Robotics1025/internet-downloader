import { useMemo } from 'react';
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
  const groups = useMemo(() => buildGroups(downloads), [downloads]);

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
          style={{ background: 'rgba(168,85,247,0.10)', color: '#a855f7' }}
        >
          ▦
        </div>
        <p className="text-sm font-medium text-white">No playlists or artists yet</p>
        <p className="text-xs mt-1.5 max-w-sm" style={{ color: '#8892a8' }}>
          Paste a YouTube playlist URL (one with <code style={{ color: '#cbd5e1' }}>?list=</code>) or
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
        <div className="flex gap-6 items-center">
          <div
            className="w-44 h-44 rounded-2xl shrink-0 relative overflow-hidden"
            style={{
              background: active.thumb
                ? `center / cover no-repeat url(${active.thumb})`
                : 'linear-gradient(135deg,#6366f1,#a855f7)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            {!active.thumb && (
              <div className="absolute inset-0 flex items-center justify-center text-5xl text-white/80">▦</div>
            )}
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{active.name}</h1>
            <div className="flex items-center gap-2 text-sm mt-1 mb-4" style={{ color: '#8892a8' }}>
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
                      background: firstCompleted ? '#6366f1' : 'rgba(99,102,241,0.3)',
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
                style={{ background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                📁 Open Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Horizontal group strip */}
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {groups.map(g => {
          const isActive = effectiveActive === g.id;
          return (
            <button
              key={g.id}
              onClick={() => onActiveGroupChange(g.id)}
              className="flex items-center gap-3 p-2 rounded-2xl min-w-[210px] text-left transition-all"
              style={{
                background: isActive ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                border: isActive ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div
                className="w-14 h-14 rounded-xl shrink-0"
                style={{
                  background: g.thumb
                    ? `center / cover no-repeat url(${g.thumb})`
                    : 'linear-gradient(135deg,#6366f1,#a855f7)',
                }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-white truncate">{g.name}</span>
                <span className="text-[11px] mt-0.5" style={{ color: '#8892a8' }}>
                  {g.items.length} {g.items.length === 1 ? 'video' : 'videos'}
                </span>
                <span className="text-[11px]" style={{ color: '#505a6e' }}>
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
          style={{ color: '#505a6e', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
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
            />
          ))
        ) : (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: '#505a6e' }}>
            Nothing in this group yet.
          </div>
        )}
      </div>
    </div>
  );
}
