import type { DownloadStatus } from './types';

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function statusColor(status: DownloadStatus): string {
  switch (status) {
    case 'downloading': return '#6366f1';
    case 'completed':   return '#22d3ee';
    case 'paused':      return '#facc15';
    case 'failed':      return '#f87171';
    case 'pending':
    case 'queued':      return '#94a3b8';
    default:            return '#64748b';
  }
}

export function statusLabel(status: DownloadStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function fileExtIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return '🎬';
  if (['mp3', 'aac', 'flac', 'wav', 'ogg'].includes(ext)) return '🎵';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return '📦';
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return '📄';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['exe', 'msi', 'deb', 'rpm', 'dmg'].includes(ext)) return '⚙️';
  return '📁';
}
