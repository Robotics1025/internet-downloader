import { useState, useMemo } from 'react';
import { useDownloads } from './hooks/useDownloads';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FilterTabs } from './components/FilterTabs';
import { DownloadRow } from './components/DownloadRow';
import { DetailPanel } from './components/DetailPanel';
import { NowPlayingBar } from './components/NowPlayingBar';
import { AddDownloadDialog } from './components/AddDownloadDialog';
import { InlineMediaPlayer } from './components/InlineMediaPlayer';
import { PlaylistView, buildGroups } from './components/PlaylistView';
import { PlaylistDetailPanel } from './components/PlaylistDetailPanel';
import { api } from './api';

function App() {
  const { downloads, progress, loading, error, startDownload, addDownload, deleteDownload, refresh } = useDownloads();
  const [sidebarFilter, setSidebarFilter] = useState('cat:video');
  const [tabFilter, setTabFilter] = useState('playlists');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<Record<string, boolean>>({});

  const playing = playingId ? downloads.find(d => d.id === playingId) ?? null : null;
  const currentTrack = currentTrackId
    ? downloads.find(d => d.id === currentTrackId) ?? null
    : null;
  const selectedDownload = selectedId ? downloads.find(d => d.id === selectedId) ?? null : null;

  // For the right-side playlist detail panel: resolve the currently-active
  // group from the same grouping helper PlaylistView uses, so the panel
  // always mirrors what the centre column shows.
  const allGroups = useMemo(() => buildGroups(downloads), [downloads]);
  const activeGroup = useMemo(() => {
    if (allGroups.length === 0) return null;
    const wanted = activeGroupId ? allGroups.find(g => g.id === activeGroupId) : null;
    return wanted ?? allGroups[0];
  }, [allGroups, activeGroupId]);

  function handlePlay(id: string) {
    setCurrentTrackId(id);
    const d = downloads.find(x => x.id === id);
    const isVideo = d ? /\.(mp4|webm|mkv|mov|m4v|avi|ogv)$/i.test(d.file_name) : false;
    // Video opens the inline player; audio plays inside the now-playing bar.
    if (isVideo) setPlayingId(id);
  }

  // Counts for sidebar
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: downloads.length };
    downloads.forEach(d => {
      const status = progress[d.id]?.status ?? d.status;
      c[status] = (c[status] || 0) + 1;
    });
    return c;
  }, [downloads, progress]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    downloads.forEach(d => {
      const k = d.category || 'other';
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [downloads]);

  const activeCategory = sidebarFilter.startsWith('cat:') ? sidebarFilter.slice(4) : 'all';

  // Apply filters
  const filtered = useMemo(() => {
    let result = downloads;

    // Apply sidebar filter first
    if (sidebarFilter !== 'all') {
      if (sidebarFilter.startsWith('cat:')) {
        const cat = sidebarFilter.slice(4);
        if (cat !== 'all') {
          result = result.filter(d => (d.category || 'other') === cat);
        }
      } else {
        result = result.filter(d => {
          const status = progress[d.id]?.status ?? d.status;
          return status === sidebarFilter;
        });
      }
    }

    // Apply tab filter
    if (tabFilter === 'downloaded') {
      result = result.filter(d => (progress[d.id]?.status ?? d.status) === 'completed');
    } else if (tabFilter === 'recent') {
      // Recently played ≈ recently completed; sort newest first.
      result = result
        .filter(d => (progress[d.id]?.status ?? d.status) === 'completed')
        .slice()
        .sort((a, b) => {
          const ta = a.completed_at ? Date.parse(a.completed_at) : 0;
          const tb = b.completed_at ? Date.parse(b.completed_at) : 0;
          return tb - ta;
        });
    } else if (tabFilter !== 'all' && !['playlists', 'artists'].includes(tabFilter)) {
      if (tabFilter === '4k') {
        result = result.filter(d => d.file_name.toLowerCase().includes('4k'));
      } else {
        result = result.filter(d => {
          const status = progress[d.id]?.status ?? d.status;
          return status === tabFilter;
        });
      }
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.file_name.toLowerCase().includes(q) ||
        d.url.toLowerCase().includes(q)
      );
    }

    return result;
  }, [downloads, progress, sidebarFilter, tabFilter, searchQuery]);

  async function handleStart(id: string) {
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await startDownload(id);
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this download from the list?')) return;
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await deleteDownload(id);
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  async function handleReveal(id: string) {
    try {
      await api.revealDownload(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to open folder');
    }
  }

  function handleSidebarFilter(f: string) {
    setSidebarFilter(f);
    // Reset tab filter when sidebar changes
    if (!f.startsWith('cat:')) {
      setTabFilter('all');
    }
  }

  return (
    <div id="app-root" className="flex flex-col h-screen w-full overflow-hidden text-white" style={{ background: '#0a0e1a' }}>
      {/* Top bar */}
      <TopBar
        onAddClick={() => setShowAdd(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
      />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          activeFilter={sidebarFilter}
          onFilterChange={handleSidebarFilter}
          counts={counts}
          categoryCounts={categoryCounts}
        />

        {/* Center content */}
        <main id="main-content" className="flex-1 flex flex-col min-w-0" style={{ background: '#0f1423' }}>
          {playing ? (
            <InlineMediaPlayer
              download={playing}
              playlist={filtered}
              progress={progress}
              onClose={() => setPlayingId(null)}
              onSelect={setPlayingId}
              onStart={handleStart}
              onDelete={handleDelete}
              onReveal={handleReveal}
              actioning={actioning}
            />
          ) : (
            <>
              {/* Filter tabs */}
              <FilterTabs
                activeTab={tabFilter}
                onTabChange={setTabFilter}
                counts={counts}
                activeCategory={activeCategory}
              />

          {/* Download list */}
          <div className="flex-1 overflow-y-auto">
            {tabFilter === 'playlists' || tabFilter === 'artists' ? (
              <PlaylistView
                downloads={filtered}
                progress={progress}
                onStart={handleStart}
                onDelete={handleDelete}
                onPlay={handlePlay}
                onReveal={handleReveal}
                onSelect={setSelectedId}
                selectedId={selectedId}
                actioning={actioning}
                activeGroupId={activeGroupId}
                onActiveGroupChange={setActiveGroupId}
              />
            ) : loading && downloads.length === 0 ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-[72px] rounded-xl skeleton" />
                ))}
              </div>
            ) : error && downloads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-2xl"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                >
                  ⚠
                </div>
                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>{error}</p>
                <p className="text-xs mt-2" style={{ color: '#505a6e' }}>Check if the API server is running</p>
                <button
                  onClick={refresh}
                  className="mt-4 px-4 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: 'rgba(59,130,246,0.15)',
                    color: '#3b82f6',
                    border: '1px solid rgba(59,130,246,0.2)',
                  }}
                >
                  ↻ Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 text-3xl"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  📥
                </div>
                <p className="text-sm font-medium text-white">No downloads yet</p>
                <p className="text-xs mt-1.5" style={{ color: '#505a6e' }}>
                  Paste a URL or click "Add Download" to get started
                </p>
                <button
                  onClick={() => setShowAdd(true)}
                  className="mt-4 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: 'white',
                    boxShadow: '0 4px 16px rgba(34,197,94,0.25)',
                  }}
                >
                  + Add Your First Download
                </button>
              </div>
            ) : (
              <div>
                {filtered.map(d => (
                  <DownloadRow
                    key={d.id}
                    download={d}
                    progress={progress[d.id]}
                    onStart={handleStart}
                    onDelete={handleDelete}
                    onPlay={handlePlay}
                    onReveal={handleReveal}
                    onSelect={setSelectedId}
                    isSelected={selectedId === d.id}
                    actionLoading={actioning[d.id] || false}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>

        {/* Detail panel (right side) */}
        {selectedDownload ? (
          <DetailPanel
            download={selectedDownload}
            progress={progress[selectedDownload.id]}
            onClose={() => setSelectedId(null)}
            onPlay={handlePlay}
            onReveal={handleReveal}
          />
        ) : (tabFilter === 'playlists' || tabFilter === 'artists') ? (
          <PlaylistDetailPanel
            group={activeGroup}
            onClose={() => setActiveGroupId(null)}
            onPlayAll={() => {
              const first = activeGroup?.items.find(i => i.status === 'completed');
              if (first) handlePlay(first.id);
            }}
            onShuffle={() => {
              const playable = activeGroup?.items.filter(i => i.status === 'completed') ?? [];
              if (playable.length === 0) return;
              const pick = playable[Math.floor(Math.random() * playable.length)];
              handlePlay(pick.id);
            }}
            onOpenFolder={() => {
              const c = activeGroup?.items.find(i => i.status === 'completed');
              if (c) handleReveal(c.id);
            }}
          />
        ) : null}
      </div>

      {/* Now playing / status bar (Spotify-style; falls back to download stats when idle) */}
      <NowPlayingBar
        currentTrack={currentTrack}
        queue={filtered}
        onClose={() => { setCurrentTrackId(null); setPlayingId(null); }}
        onSelect={handlePlay}
        onExpand={() => currentTrack && setPlayingId(currentTrack.id)}
        downloads={downloads}
        progress={progress}
      />

      {/* Modals */}
      {showAdd && (
        <AddDownloadDialog
          onClose={() => setShowAdd(false)}
          onAdd={addDownload}
        />
      )}
    </div>
  );
}

export default App;
