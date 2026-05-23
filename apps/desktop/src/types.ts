export type DownloadStatus =
  | 'pending'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'merging'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Download {
  id: string;
  url: string;
  file_name: string;
  save_path: string;
  total_size: number | null;
  downloaded_size: number;
  status: DownloadStatus;
  resume_supported: boolean;
  segment_count: number;
  category: string;
  speed_limit: number | null;
  checksum: string | null;
  checksum_algorithm: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ProgressSnapshot {
  event: 'progress';
  download_id: string;
  downloaded_bytes: number;
  total_size: number | null;
  speed_bps: number;
  eta_seconds: number | null;
  percent: number | null;
  status: DownloadStatus;
  active_segments: number;
}

export interface AddDownloadPayload {
  url: string;
  save_path: string;
  category?: string;
}
