#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod error;
mod sidecar;

use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match sidecar::start(&handle).await {
                    Ok(port) => {
                        let init = format!("window.__DM_API_PORT__ = {port};");
                        if let Err(err) = WebviewWindowBuilder::new(
                            &handle,
                            "main",
                            WebviewUrl::App("index.html".into()),
                        )
                        .title("DownloadMgr")
                        .inner_size(1280.0, 800.0)
                        .min_inner_size(900.0, 600.0)
                        .initialization_script(&init)
                        .build()
                        {
                            eprintln!("failed to open main window: {err}");
                        }
                    }
                    Err(err) => {
                        eprintln!("sidecar failed to start: {err}");
                        // Open a minimal error window so the user isn't staring at
                        // an empty screen.
                        let _ = WebviewWindowBuilder::new(
                            &handle,
                            "error",
                            WebviewUrl::External("about:blank".parse().unwrap()),
                        )
                        .title("DownloadMgr — error")
                        .inner_size(600.0, 200.0)
                        .initialization_script(&format!(
                            "document.body.innerHTML = '<pre style=\"padding:24px;font:14px monospace\">DownloadMgr failed to start the backend.<br><br>{err}</pre>';"
                        ))
                        .build();
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DownloadMgr");
}
