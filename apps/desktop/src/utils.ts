import type { DownloadStatus } from './types';

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i >= 2 ? 2 : 1)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s left`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m left`;
}

export function statusColor(status: DownloadStatus): string {
  switch (status) {
    case 'downloading': return '#3b82f6';
    case 'completed':   return '#22c55e';
    case 'paused':      return '#f59e0b';
    case 'failed':      return '#ef4444';
    case 'pending':
    case 'queued':      return '#6b7280';
    case 'merging':     return '#8b5cf6';
    case 'cancelled':   return '#6b7280';
    default:            return '#6b7280';
  }
}

export function statusLabel(status: DownloadStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function statusIcon(status: DownloadStatus): string {
  switch (status) {
    case 'downloading': return '↓';
    case 'completed':   return '✓';
    case 'paused':      return '⏸';
    case 'failed':      return '✕';
    case 'pending':     return '⏳';
    case 'queued':      return '⋯';
    case 'merging':     return '⟳';
    case 'cancelled':   return '⊘';
    default:            return '•';
  }
}

export function getCategoryFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'aac', 'flac', 'wav', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) return 'audio';
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz', 'zst'].includes(ext)) return 'compressed';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'xlsx', 'pptx', 'csv', 'rtf', 'odt'].includes(ext)) return 'document';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'].includes(ext)) return 'image';
  if (['exe', 'msi', 'deb', 'rpm', 'dmg', 'appimage', 'snap', 'flatpak'].includes(ext)) return 'software';
  return 'other';
}

/** Returns a gradient pair for file type thumbnails */
export function fileTypeGradient(filename: string): [string, string] {
  const cat = getCategoryFromFilename(filename);
  switch (cat) {
    case 'video':      return ['#f97316', '#ea580c'];
    case 'audio':      return ['#ec4899', '#db2777'];
    case 'compressed': return ['#a855f7', '#9333ea'];
    case 'document':   return ['#3b82f6', '#2563eb'];
    case 'image':      return ['#06b6d4', '#0891b2'];
    case 'software':   return ['#14b8a6', '#0d9488'];
    default:           return ['#6b7280', '#4b5563'];
  }
}

/** Returns extension label (uppercased, max 4 chars) for the thumbnail badge */
export function fileExtLabel(filename: string): string {
  const ext = filename.split('.').pop()?.toUpperCase() ?? '';
  return ext.slice(0, 4);
}

/** Returns an icon character for the file category */
export function fileCategoryIcon(filename: string): string {
  const cat = getCategoryFromFilename(filename);
  switch (cat) {
    case 'video':      return '▶';
    case 'audio':      return '♪';
    case 'compressed': return '⧈';
    case 'document':   return '📄';
    case 'image':      return '🖼';
    case 'software':   return '⚙';
    default:           return '📁';
  }
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${h12}:${mins} ${ampm}`;
}
