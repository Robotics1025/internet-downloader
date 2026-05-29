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
  media_format_id: string | null;
}

export interface MediaFormat {
  format_id: string;
  ext: string;
  resolution: string | null;
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  tbr: number | null;
  format_note: string | null;
  has_video: boolean;
  has_audio: boolean;
}

export interface MediaProbeResult {
  is_media: boolean;
  title: string | null;
  duration: number | null;
  thumbnail: string | null;
  extractor: string | null;
  formats: MediaFormat[];
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
  file_name?: string;
  media_format_id?: string;
}
