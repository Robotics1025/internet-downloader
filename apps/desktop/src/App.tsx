import { useState, useMemo } from 'react';
import { useDownloads } from './hooks/useDownloads';
import { Sidebar } from './components/Sidebar';
import { DownloadRow } from './components/DownloadRow';
import { AddDownloadDialog } from './components/AddDownloadDialog';

function App() {
  const { downloads, progress, loading, error, startDownload, addDownload, refresh } = useDownloads();
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [actioning, setActioning] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: downloads.length };
    downloads.forEach(d => {
      c[d.status] = (c[d.status] || 0) + 1;
    });
    return c;
  }, [downloads]);

  const filtered = useMemo(() => {
    if (filter === 'all') return downloads;
    return downloads.filter(d => d.status === filter);
  }, [downloads, filter]);

  async function handleStart(id: string) {
    setActioning(prev => ({ ...prev, [id]: true }));
    try {
      await startDownload(id);
    } finally {
      setActioning(prev => ({ ...prev, [id]: false }));
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden text-white" style={{ background: '#0f0f17' }}>
      <Sidebar activeFilter={filter} onFilterChange={setFilter} counts={counts} />

      <main className="flex-1 flex flex-col relative" style={{ background: '#16161f' }}>
        {/* Top bar */}
        <header className="h-16 px-6 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: '#16161f' }}>
          <h1 className="text-xl font-bold">{filter === 'all' ? 'All Downloads' : filter.charAt(0).toUpperCase() + filter.slice(1)}</h1>
          
          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              className="p-2 rounded-xl text-xs transition-colors"
              style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.03)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            >
              ↻ Refresh
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
              style={{ background: '#6366f1', color: 'white', boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}
            >
              <span className="text-lg leading-none">+</span> Add Download
            </button>
          </div>
        </header>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && downloads.length === 0 ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-2xl skeleton" />
              ))}
            </div>
          ) : error && downloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-red-400">
              <span className="text-4xl mb-4">✕</span>
              <p>{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center" style={{ color: '#475569' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                ∅
              </div>
              <p>No downloads found.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map(d => (
                <DownloadRow
                  key={d.id}
                  download={d}
                  progress={progress[d.id]}
                  onStart={handleStart}
                  actionLoading={actioning[d.id] || false}
                />
              ))}
            </div>
          )}
        </div>
      </main>

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
