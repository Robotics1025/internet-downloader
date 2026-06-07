import { useState, useMemo, useCallback } from 'react';
import { useDownloads } from './hooks/useDownloads';
import { useTheme } from './hooks/useTheme';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SettingsScreen } from './screens/SettingsScreen';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { FilterTabs } from './components/FilterTabs';
import { DownloadRow } from './components/DownloadRow';
import { DetailPanel } from './components/DetailPanel';
import { NowPlayingBar } from './components/NowPlayingBar';
import { AddDownloadDialog } from './components/AddDownloadDialog';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { InlineMediaPlayer } from './components/InlineMediaPlayer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PlaylistView, buildGroups } from './components/PlaylistView';
import { PlaylistDetailPanel } from './components/PlaylistDetailPanel';
import { EmptyState } from './components/EmptyState';
import { SkeletonRow } from './components/SkeletonRow';
import { api } from './api';
import {
  Inbox,
  Download,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';

function App() {
  const [theme, setTheme] = useTheme();
  const { downloads, progress, loading, error, startDownload, pauseDownload, addDownload, deleteDownload, refresh } = useDownloads();
  const [view, setView] = useState<'downloads' | 'settings'>('downloads');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [sidebarFilter, setSidebarFilter] = useState('cat:video');
  const [tabFilter, setTabFilter] = useState('playlists');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [actioning, setActioning] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<import('./types').Download | null>(null);

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
  async function handlePlay(id: string) {
    const d = downloads.find(x => x.id === id);
    if (!d) return;

    const fileName = d.file_name || '';
    const ext = fileName.split('.').pop()?.toUpperCase() || '';
    const isVideo = /\.(mp4|webm|mkv|mov|m4v|avi|ogv)$/i.test(fileName);
    const isAudio = d.category === 'audio' || ['MP3', 'AAC', 'FLAC', 'WAV', 'OGG', 'M4A'].includes(ext);

    if (isVideo) {
      setCurrentTrackId(id);
      setPlayingId(id);
    } else if (isAudio) {
      setCurrentTrackId(id);
    } else {
      // It's a document/image or other non-media completed file — launch it natively!
      try {
        await api.openDownload(id);
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Failed to open file');
      }
    }
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

  // All videos in the active group/view — shown in the player sidebar.
  // Navigating skips non-completed items; ALL videos are still listed.
  const playingPlaylist = useMemo(() => {
    const isPlaylistsTab = tabFilter === 'playlists' || tabFilter === 'artists';
    const sourceList = isPlaylistsTab && activeGroup ? activeGroup.items : filtered;
    return sourceList.filter(d =>
      /\.(mp4|webm|mkv|mov|m4v|avi|ogv)$/i.test(d.file_name || '') || d.category === 'video'
    );
  }, [tabFilter, activeGroup, filtered]);

  async function handleStart(id: string) {
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await startDownload(id);
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  async function handlePause(id: string) {
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await pauseDownload(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to pause');
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  async function performDelete(id: string, deleteFile: boolean) {
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await deleteDownload(id, deleteFile);
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  function handleDelete(id: string) {
    const d = downloads.find(x => x.id === id);
    const status = d ? (progress[d.id]?.status ?? d.status) : undefined;
    if (d && status === 'completed') {
      setDeleteTarget(d);
      return;
    }
    if (!confirm('Delete this download from the list?')) return;
    void performDelete(id, false);
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

  const handlePasteUrl = useCallback(async () => {
    try {
      const url = await navigator.clipboard.readText();
      if (url) {
        setShowAdd(true);
        // Pre-fill is handled by opening the dialog; clipboard content
        // available for user to paste into the input.
      } else {
        setShowAdd(true);
      }
    } catch {
      // Permission denied — fall back to opening empty dialog.
      setShowAdd(true);
    }
  }, []);

  // Derive filter-context empty state props
  const emptyStateProps = useMemo(() => {
    // Sidebar status filters
    if (!sidebarFilter.startsWith('cat:')) {
      switch (sidebarFilter) {
        case 'active':
        case 'queued':
          return { icon: Download, title: 'Nothing downloading', body: 'Start a download or paste a URL to begin.' };
        case 'completed':
          return { icon: CheckCircle, title: 'No completed downloads', body: 'Finished downloads will appear here.' };
        case 'failed':
          return { icon: AlertCircle, title: 'No failed downloads', body: 'Any downloads that fail will show up here.' };
      }
    }
    // Tab-level filters
    switch (tabFilter) {
      case 'active':
        return { icon: Download, title: 'Nothing downloading', body: 'Start a download or paste a URL to begin.' };
      case 'downloaded':
      case 'completed':
        return { icon: CheckCircle, title: 'No completed downloads', body: 'Finished downloads will appear here.' };
      case 'failed':
        return { icon: AlertCircle, title: 'No failed downloads', body: 'Any downloads that fail will show up here.' };
    }
    // Default / "All" view
    return {
      icon: Inbox,
      title: 'No downloads yet',
      body: 'Add a URL above, or use the browser extension to send media here.',
    };
  }, [sidebarFilter, tabFilter]);

  return (
    <div id="app-root" className="flex flex-col h-screen w-full overflow-hidden" style={{ background: 'var(--dm-color-bg-app)', color: 'var(--dm-color-fg-primary)' }}>
      {/* Top bar */}
      <TopBar
        onAddClick={() => setShowAdd(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
        themeSwitcher={<ThemeSwitcher theme={theme} onChange={setTheme} />}
      />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          activeFilter={sidebarFilter}
          onFilterChange={handleSidebarFilter}
          counts={counts}
          categoryCounts={categoryCounts}
          onSettingsClick={() => setView('settings')}
        />

        {/* Center content */}
        <main id="main-content" className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--dm-color-bg-recessed)' }}>
          {view === 'settings' ? (
            <SettingsScreen onClose={() => setView('downloads')} />
          ) : playing ? (
            <ErrorBoundary onReset={() => setPlayingId(null)}>
              <InlineMediaPlayer
                download={playing}
                playlist={playingPlaylist}
                onClose={() => setPlayingId(null)}
                onSelect={setPlayingId}
              />
            </ErrorBoundary>
          ) : (
            <>
              {/* Filter tabs */}
              <FilterTabs
                activeTab={tabFilter}
                onTabChange={setTabFilter}
                counts={counts}
                activeCategory={activeCategory}
                isGridView={layout === 'grid'}
                onViewToggle={() => setLayout(l => l === 'list' ? 'grid' : 'list')}
              />

          {/* Download list */}
          <div className="flex-1 overflow-y-auto">
            {tabFilter === 'playlists' || tabFilter === 'artists' ? (
              <PlaylistView
                downloads={filtered}
                progress={progress}
                onStart={handleStart}
                onPause={handlePause}
                onDelete={handleDelete}
                onPlay={handlePlay}
                onReveal={handleReveal}
                onSelect={setSelectedId}
                selectedId={selectedId}
                actioning={actioning}
                activeGroupId={activeGroupId}
                onActiveGroupChange={setActiveGroupId}
              />
            ) : error && downloads.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Can't reach DownloadMgr"
                body={`The backend isn't responding. ${typeof error === 'string' ? error : ''}`}
                cta={{ label: 'Retry', onClick: refresh }}
              />
            ) : loading && downloads.length === 0 ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : filtered.length === 0 ? (
              <EmptyState
                {...emptyStateProps}
                cta={
                  emptyStateProps.icon === Inbox
                    ? { label: 'Paste URL', onClick: handlePasteUrl }
                    : undefined
                }
              />
            ) : (
              <div
                style={
                  layout === 'grid'
                    ? {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                        gap: '16px',
                        padding: '16px',
                      }
                    : {}
                }
              >
                {filtered.map(d => (
                  <DownloadRow
                    key={d.id}
                    download={d}
                    progress={progress[d.id]}
                    onStart={handleStart}
                    onPause={handlePause}
                    onDelete={handleDelete}
                    onPlay={handlePlay}
                    onReveal={handleReveal}
                    onSelect={setSelectedId}
                    isSelected={selectedId === d.id}
                    actionLoading={actioning[d.id] || false}
                    variant={layout}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>

        {/* Detail panel — hidden while inline player is open */}
        {!playing && selectedDownload ? (
          <DetailPanel
            download={selectedDownload}
            progress={progress[selectedDownload.id]}
            onClose={() => setSelectedId(null)}
            onPlay={handlePlay}
            onReveal={handleReveal}
          />
        ) : !playing && (tabFilter === 'playlists' || tabFilter === 'artists') ? (
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

      {deleteTarget && (
        <DeleteConfirmDialog
          download={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={(deleteFile) => {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            void performDelete(id, deleteFile);
          }}
        />
      )}
    </div>
  );
}

export default App;
