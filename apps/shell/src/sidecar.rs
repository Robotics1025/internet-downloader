use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;

use crate::error::ShellError;

const DM_PORT_PREFIX: &str = "DM_PORT ";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Spawn the bundled `dm-api` sidecar. Blocks until the sidecar prints its
/// ``DM_PORT <N>`` line on stdout, then returns the port. The sidecar
/// continues running in the background; its further stdout is logged.
pub async fn start(app: &AppHandle) -> Result<u16, ShellError> {
    let sidecar = app
        .shell()
        .sidecar("dm-api")
        .map_err(|e| ShellError::SpawnSidecar(e.to_string()))?
        .args(["--port", "0"]);

    let (mut rx, _child) = sidecar
        .spawn()
        .map_err(|e| ShellError::SpawnSidecar(e.to_string()))?;

    let (port_tx, port_rx) = oneshot::channel::<Result<u16, ShellError>>();
    let mut port_tx = Some(port_tx);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    if let Some(rest) = line.strip_prefix(DM_PORT_PREFIX) {
                        if let Some(tx) = port_tx.take() {
                            let parsed = rest
                                .trim()
                                .parse::<u16>()
                                .map_err(|_| ShellError::InvalidDmPortLine(line.to_string()));
                            let _ = tx.send(parsed);
                        }
                    }
                    eprintln!("[dm-api stdout] {}", line.trim_end());
                }
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[dm-api stderr] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[dm-api] terminated: code={:?}", payload.code);
                    if let Some(tx) = port_tx.take() {
                        let _ = tx.send(Err(ShellError::SpawnSidecar(
                            "sidecar exited before announcing DM_PORT".into(),
                        )));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    match tokio::time::timeout(STARTUP_TIMEOUT, port_rx).await {
        Ok(Ok(Ok(port))) => Ok(port),
        Ok(Ok(Err(err))) => Err(err),
        Ok(Err(_canceled)) => Err(ShellError::SpawnSidecar(
            "sidecar oneshot canceled before DM_PORT".into(),
        )),
        Err(_elapsed) => Err(ShellError::SidecarStartupTimeout(STARTUP_TIMEOUT)),
    }
}
