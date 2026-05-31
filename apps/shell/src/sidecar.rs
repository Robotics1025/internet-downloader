use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;

use crate::error::ShellError;

const DM_PORT_PREFIX: &str = "DM_PORT ";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Resolve the file we write sidecar stdout+stderr to.
///
/// On Windows the shipped Tauri binary has no console (`windows_subsystem =
/// "windows"`), so `eprintln!` goes nowhere and any sidecar crash is invisible
/// to the user. Writing to a known log file gives them — and us — something to
/// open when "Failed to fetch" shows up in the UI.
fn sidecar_log_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_log_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("sidecar.log"))
}

/// Spawn the bundled `dm-api` sidecar. Blocks until the sidecar prints its
/// ``DM_PORT <N>`` line on stdout, then returns the port. The sidecar
/// continues running in the background; its stdout/stderr is mirrored both
/// to the host's eprintln (visible only in dev / `cargo tauri dev`) and to
/// a per-user log file under the OS app-log dir.
pub async fn start(app: &AppHandle) -> Result<u16, ShellError> {
    // Set DM_DATA_DIR to the OS-appropriate per-user data directory so the
    // sidecar's SQLite + logs land somewhere writable on every platform
    // (rather than the Linux-flavoured `~/.local/share/...` default which is
    // surprising on Windows / macOS).
    let app_data_dir = app
        .path()
        .app_data_dir()
        .ok()
        .map(|p| p.to_string_lossy().into_owned());

    let log_path = sidecar_log_path(app);
    let log_file = log_path.as_ref().and_then(|p| {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(p)
            .ok()
            .map(Mutex::new)
    });
    let log_file = std::sync::Arc::new(log_file);

    let write_log = {
        let log_file = log_file.clone();
        move |tag: &str, line: &str| {
            eprintln!("[dm-api {tag}] {}", line.trim_end());
            if let Some(mutex) = log_file.as_ref() {
                if let Ok(mut f) = mutex.lock() {
                    let _ = writeln!(f, "[{}] {}", tag, line.trim_end());
                    let _ = f.flush();
                }
            }
        }
    };
    write_log("shell", "=== sidecar boot ===");
    if let Some(ref p) = log_path {
        write_log("shell", &format!("sidecar log file: {}", p.display()));
    }

    let mut command = app
        .shell()
        .sidecar("dm-api")
        .map_err(|e| ShellError::SpawnSidecar(e.to_string()))?
        .args(["--port", "0"]);
    if let Some(dir) = app_data_dir {
        write_log("shell", &format!("DM_DATA_DIR={}", dir));
        command = command.env("DM_DATA_DIR", dir);
    }

    let (mut rx, _child) = command
        .spawn()
        .map_err(|e| ShellError::SpawnSidecar(e.to_string()))?;

    let (port_tx, port_rx) = oneshot::channel::<Result<u16, ShellError>>();
    let mut port_tx = Some(port_tx);

    let log_for_task = write_log.clone();
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
                    log_for_task("stdout", &line);
                }
                CommandEvent::Stderr(bytes) => {
                    log_for_task("stderr", &String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Terminated(payload) => {
                    log_for_task("term", &format!("exit code = {:?}", payload.code));
                    if let Some(tx) = port_tx.take() {
                        let _ = tx.send(Err(ShellError::SpawnSidecar(
                            "sidecar exited before announcing DM_PORT — check sidecar.log".into(),
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
