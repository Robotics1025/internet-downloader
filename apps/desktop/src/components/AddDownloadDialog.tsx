import { useState } from 'react';

interface AddDownloadDialogProps {
  onAdd: (url: string, savePath: string, category: string) => Promise<unknown>;
  onClose: () => void;
}

const CATEGORIES = ['general', 'video', 'audio', 'document', 'archive', 'other'];

export function AddDownloadDialog({ onAdd, onClose }: AddDownloadDialogProps) {
  const [url, setUrl] = useState('');
  const [savePath, setSavePath] = useState(
    navigator.platform.toLowerCase().includes('win') ? 'C:\\Users\\User\\Downloads' : '/home/' + (window.location.hostname || 'user') + '/Downloads'
  );
  const [category, setCategory] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onAdd(url.trim(), savePath.trim(), category);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add download');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl animate-fade-slide" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="text-lg font-bold text-white">Add Download</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Paste a direct URL to start downloading</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors" style={{ color: '#64748b' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* URL */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>URL *</label>
            <input
              type="url"
              required
              placeholder="https://example.com/file.zip"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>

          {/* Save Path */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Save to</label>
            <input
              type="text"
              required
              value={savePath}
              onChange={e => setSavePath(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all"
                  style={{
                    background: category === cat ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                    color: category === cat ? '#a5b4fc' : '#64748b',
                    border: `1px solid ${category === cat ? '#6366f1' : 'transparent'}`,
                  }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
              ⚠ {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !url.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: loading || !url.trim() ? 'rgba(99,102,241,0.3)' : '#6366f1',
                color: loading || !url.trim() ? '#a5b4fc' : 'white',
                cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
              }}>
              {loading ? '⏳ Adding…' : '⬇ Add Download'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
