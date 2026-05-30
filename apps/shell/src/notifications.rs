use std::collections::HashSet;
use std::time::Duration;

use futures_util::StreamExt;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;
use tokio_tungstenite::tungstenite::Message;

/// Snapshot DTO matching apps/api/src/dm_api/presentation/schemas/progress_dto.py
/// (we only deserialize the few fields we use).
#[derive(Debug, Deserialize)]
struct ProgressSnapshot {
    download_id: String,
    status: String,
}

/// Spawn a background task that subscribes to the API's WebSocket and posts a
/// native notification for every download transitioning to a terminal state
/// (completed or failed). De-dupes by `download_id`.
pub fn install(app: &AppHandle, port: u16) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut notified: HashSet<String> = HashSet::new();

        loop {
            let url = format!("ws://127.0.0.1:{port}/api/ws/progress");
            match tokio_tungstenite::connect_async(&url).await {
                Ok((mut ws, _)) => {
                    while let Some(message) = ws.next().await {
                        let Ok(msg) = message else { break };
                        if let Message::Text(text) = msg {
                            if let Ok(snap) = serde_json::from_str::<ProgressSnapshot>(&text) {
                                match snap.status.as_str() {
                                    "completed" if notified.insert(snap.download_id.clone()) => {
                                        let _ = handle
                                            .notification()
                                            .builder()
                                            .title("DownloadMgr")
                                            .body("Download completed")
                                            .show();
                                    }
                                    "failed" if notified.insert(snap.download_id.clone()) => {
                                        let _ = handle
                                            .notification()
                                            .builder()
                                            .title("DownloadMgr")
                                            .body("Download failed")
                                            .show();
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("notifications: websocket connect failed: {e}");
                }
            }
            // Reconnect after a short backoff.
            sleep(Duration::from_secs(3)).await;
        }
    });
}
