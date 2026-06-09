#!/usr/bin/env bash
# Launch DownloadMgr with the system library paths only.
#
# Why: this machine has ROS Jazzy + Anaconda on LD_LIBRARY_PATH / PATH, which
# bundle their own (older / different) GStreamer + GLib libraries. When the
# Tauri AppImage spawns webkit2gtk it ends up dlopen'ing those by accident,
# and webkit2gtk's media probe can't find `appsink` / `autoaudiosink`. Result:
# clicking Play in the player gives a blank white webview.
#
# Stripping anaconda + /opt/ros from PATH/LD_LIBRARY_PATH and forcing
# GST_PLUGIN_SYSTEM_PATH at /usr/lib/x86_64-linux-gnu/gstreamer-1.0 makes
# webkit2gtk use the system GStreamer (which has the gstreamer1.0-plugins-bad
# + gstreamer1.0-pulseaudio plugins you installed).

set -e

APPIMAGE="${1:-$(dirname "$(readlink -f "$0")")/apps/shell/target/release/bundle/appimage/DownloadMgr_0.1.1_amd64.AppImage}"

if [[ ! -x "$APPIMAGE" ]]; then
  echo "AppImage not found at: $APPIMAGE" >&2
  echo "Build it first: cd apps/shell && cargo tauri build" >&2
  exit 1
fi

# Strip Anaconda + ROS from PATH / LD_LIBRARY_PATH so the AppImage links
# against system glib / gstreamer instead.
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -vE 'anaconda|/opt/ros' | tr '\n' ':' | sed 's/:$//')"
export LD_LIBRARY_PATH="$(echo "${LD_LIBRARY_PATH:-}" | tr ':' '\n' | grep -vE 'anaconda|/opt/ros' | tr '\n' ':' | sed 's/:$//')"

# When launched from a snap-confined terminal (e.g. VS Code installed as a snap),
# XDG_DATA_HOME / XDG_CONFIG_HOME / XDG_CACHE_HOME are redirected into
# ~/snap/<app>/.../.local/share. DownloadMgr stores its SQLite database under
# XDG_DATA_HOME, so it ends up reading an *empty* db there instead of the real
# one at ~/.local/share/download-manager — making the UI show zero downloads.
# Reset any snap-redirected XDG dirs back to the per-user defaults.
for v in XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME; do
  if [[ "${!v:-}" == *"/snap/"* ]]; then unset "$v"; fi
done
unset SNAP SNAP_NAME SNAP_USER_DATA SNAP_USER_COMMON SNAP_INSTANCE_NAME 2>/dev/null || true

# Force webkit2gtk to look only at the system GStreamer plugin dir.
export GST_PLUGIN_SYSTEM_PATH=/usr/lib/x86_64-linux-gnu/gstreamer-1.0
unset GST_PLUGIN_PATH

# Force-rebuild the GStreamer registry so any cached entries pointing at
# anaconda's plugins get replaced with system ones.
rm -rf "$HOME/.cache/gstreamer-1.0"

exec "$APPIMAGE" "${@:2}"
