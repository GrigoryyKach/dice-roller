//! Dice Roller: the Rust side of the Tauri app.
//!
//! - config, history and statistics files with atomic writes and BOM-tolerant reads;
//! - the NIMVORO contract: language marker next to the exe, update check, hand-off to the launcher,
//!   self-update without the launcher (`selfupdate.rs`, shared with the other tools);
//! - window size and position, restored onto a connected monitor.
//!
//! The 3D scene, the physics and the dice rules live in the TypeScript frontend (`src/`).

use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
#[cfg(not(windows))]
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize, State, WindowEvent};

pub mod selfupdate;
use selfupdate::{Phase, Release, Route, UpdateError};

/// Tool id in the NIMVORO catalog.
const TOOL_ID: &str = "dice-roller";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ───────────── files ─────────────

/// Folder with config.json, history.json, stats.json and window.json.
/// `DICEROLLER_DATA_DIR` overrides it (used for tests and demo screenshots).
pub fn data_dir() -> PathBuf {
    if let Some(d) = std::env::var_os("DICEROLLER_DATA_DIR") {
        return PathBuf::from(d);
    }
    dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("Dice Roller")
}

/// Reads a text file, dropping a UTF-8 byte-order mark if there is one.
pub fn read_text(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    Some(text.strip_prefix('\u{feff}').map(str::to_owned).unwrap_or(text))
}

/// Writes through a temporary file and renames it over the target, so a crash never leaves half a file.
pub fn write_atomic(path: &Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

fn file_for(name: &str) -> Option<&'static str> {
    match name {
        "config" => Some("config.json"),
        "history" => Some("history.json"),
        "stats" => Some("stats.json"),
        _ => None,
    }
}

/// `language` from the `.nimvoro.json` marker the launcher writes next to the exe.
pub fn marker_language(exe_dir: &Path) -> Option<String> {
    let text = read_text(&exe_dir.join(".nimvoro.json"))?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let lang = v.get("language")?.as_str()?;
    matches!(lang, "en" | "ru" | "uk").then(|| lang.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InitData {
    config: Option<String>,
    history: Option<String>,
    stats: Option<String>,
    marker_language: Option<String>,
    version: &'static str,
    args: Vec<String>,
    data_dir: String,
    /// Test hook: `DICE_ROLLER_AUTO_UPDATE=1` starts the update as soon as a newer version is found.
    auto_update: bool,
}

#[tauri::command]
fn init_state() -> InitData {
    let dir = data_dir();
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    InitData {
        config: read_text(&dir.join("config.json")),
        history: read_text(&dir.join("history.json")),
        stats: read_text(&dir.join("stats.json")),
        marker_language: exe_dir.and_then(|d| marker_language(&d)),
        version: env!("CARGO_PKG_VERSION"),
        args: std::env::args().skip(1).collect(),
        data_dir: dir.to_string_lossy().into_owned(),
        auto_update: std::env::var(selfupdate::env_name(TOOL_ID, "AUTO_UPDATE")).is_ok_and(|v| v == "1"),
    }
}

#[tauri::command]
fn save_json(name: String, text: String) -> Result<(), String> {
    let file = file_for(&name).ok_or("unknown file")?;
    write_atomic(&data_dir().join(file), &text).map_err(|e| e.to_string())
}

/// Writes a text report (used by `--dev-fairness`).
#[tauri::command]
fn write_text(path: String, text: String) -> Result<(), String> {
    write_atomic(Path::new(&path), &text).map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// ───────────── updates (NIMVORO contract) ─────────────

/// Folder that holds `launcher.json`: `%APPDATA%\NIMVORO` on Windows, `~/.config/NIMVORO` on Linux.
#[cfg(windows)]
fn nimvoro_dir() -> Option<PathBuf> {
    Some(PathBuf::from(std::env::var_os("APPDATA")?).join("NIMVORO"))
}

#[cfg(not(windows))]
fn nimvoro_dir() -> Option<PathBuf> {
    Some(dirs::config_dir()?.join("NIMVORO"))
}

/// Path to the launcher (NIMVORO.exe, or the AppImage / binary on Linux), which it records in `launcher.json`.
pub fn launcher_path() -> Option<PathBuf> {
    let text = read_text(&nimvoro_dir()?.join("launcher.json"))?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let p = PathBuf::from(v.get("path")?.as_str()?);
    p.exists().then_some(p)
}

#[derive(Serialize, Deserialize)]
struct Latest {
    tag: String,
    url: String,
}

/// Release found by the last check, and the progress of a running self-update.
pub struct Upd {
    release: Mutex<Option<Release>>,
    phase: selfupdate::Shared,
}

impl Default for Upd {
    fn default() -> Self {
        Self { release: Mutex::new(None), phase: std::sync::Arc::new(Mutex::new(Phase::Idle)) }
    }
}

/// Latest release of `repo` through curl.exe (ships with Windows), or None when the check failed.
#[tauri::command]
fn check_update(repo: String, upd: State<Upd>) -> Option<Latest> {
    if !valid_repo(&repo) {
        return None;
    }
    let r = selfupdate::fetch_release(TOOL_ID, &repo)?;
    let latest = Latest { tag: r.tag.clone(), url: r.html_url.clone() };
    *upd.release.lock().ok()? = Some(r);
    Some(latest)
}

/// `owner/name` with the characters GitHub allows.
pub fn valid_repo(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let (Some(a), Some(b), None) = (parts.next(), parts.next(), parts.next()) else { return false };
    let ok = |s: &str| !s.is_empty() && s != "." && s != ".." && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    ok(a) && ok(b)
}

/// Starts the update. Returns `"launcher"` (handed to `<launcher> --update <id>`, the app should exit),
/// `"self"` (the app updates itself in the background: poll `update_phase`) or `"page"` (the release page was opened).
#[tauri::command]
fn apply_update(id: String, repo: String, upd: State<Upd>) -> &'static str {
    let busy = !matches!(upd.phase.lock().map(|p| p.clone()), Ok(Phase::Idle | Phase::Failed(_)) | Err(_));
    if busy {
        return "self";
    }
    let dir = std::env::current_exe().ok().and_then(|e| e.parent().map(PathBuf::from));
    let writable = dir.as_deref().is_some_and(selfupdate::dir_writable);
    match selfupdate::choose_route(launcher_path(), writable) {
        Route::Launcher(exe) => {
            if Command::new(&exe).args(["--update", &id]).spawn().is_ok() {
                return "launcher";
            }
        }
        Route::SelfUpdate => {
            let release = upd.release.lock().ok().and_then(|g| g.clone());
            if let Some(r) = release {
                selfupdate::set_phase(&upd.phase, Phase::Downloading { done: 0, total: 0 });
                selfupdate::run(TOOL_ID, r, upd.phase.clone(), selfupdate::Restart::default());
                return "self";
            }
        }
        Route::OpenPage => {}
    }
    if valid_repo(&repo) {
        open_in_browser(&format!("https://github.com/{repo}/releases/latest"));
    }
    "page"
}

/// Progress of the self-update for the UI: `{ phase, done, total, error }`.
#[tauri::command]
fn update_phase(upd: State<Upd>) -> serde_json::Value {
    let p = upd.phase.lock().map(|p| p.clone()).unwrap_or(Phase::Idle);
    let (name, done, total, error) = match p {
        Phase::Idle => ("idle", 0, 0, None),
        Phase::Downloading { done, total } => ("downloading", done, total, None),
        Phase::Verifying => ("verifying", 0, 0, None),
        Phase::Installing => ("installing", 0, 0, None),
        Phase::Restarting => ("restarting", 0, 0, None),
        Phase::Failed(e) => ("failed", 0, 0, Some(error_code(e))),
    };
    serde_json::json!({ "phase": name, "done": done, "total": total, "error": error })
}

fn error_code(e: UpdateError) -> &'static str {
    match e {
        UpdateError::Download => "download",
        UpdateError::BadDigest => "digest",
        UpdateError::NoDigest => "nodigest",
        UpdateError::NoAsset | UpdateError::Extract | UpdateError::BadPackage => "package",
        UpdateError::SwapFailed => "install",
        UpdateError::Restart => "restart",
        UpdateError::SaveFailed => "save",
    }
}

#[cfg(windows)]
fn open_in_browser(url: &str) {
    let _ = Command::new("rundll32.exe").args(["url.dll,FileProtocolHandler", url]).creation_flags(CREATE_NO_WINDOW).spawn();
}

/// Linux: the default browser through xdg-open (callers already restrict the URL).
#[cfg(not(windows))]
fn open_in_browser(url: &str) {
    let _ = Command::new("xdg-open").arg(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
}

/// Only links to GitHub are opened.
#[tauri::command]
fn open_url(url: String) {
    if url.starts_with("https://github.com/") || url == "https://donatello.to/MicsGame" {
        open_in_browser(&url);
    }
}

// ───────────── window state ─────────────

#[derive(Serialize, Deserialize, Clone, Copy, Default)]
pub struct WinState {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub maximized: bool,
}

/// A saved window is restored only if its title bar would be reachable on one of the monitors.
pub fn fits(state: &WinState, monitors: &[(i32, i32, u32, u32)]) -> bool {
    if state.w < 300 || state.h < 200 {
        return false;
    }
    // A 120 x 40 strip at the top-left of the window must lie inside some monitor.
    let (sx0, sy0, sx1, sy1) = (state.x + 40, state.y, state.x + 160, state.y + 40);
    monitors.iter().any(|&(mx, my, mw, mh)| {
        sx0 >= mx && sy0 >= my && sx1 <= mx + mw as i32 && sy1 <= my + mh as i32
    })
}

struct Live(Mutex<WinState>);

fn window_file() -> PathBuf {
    data_dir().join("window.json")
}

fn restore_window(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let saved: Option<WinState> = read_text(&window_file()).and_then(|t| serde_json::from_str(&t).ok());
    if let Some(s) = saved {
        let monitors: Vec<(i32, i32, u32, u32)> = win
            .available_monitors()
            .unwrap_or_default()
            .iter()
            .map(|m| (m.position().x, m.position().y, m.size().width, m.size().height))
            .collect();
        if fits(&s, &monitors) {
            let _ = win.set_size(PhysicalSize::new(s.w, s.h));
            let _ = win.set_position(PhysicalPosition::new(s.x, s.y));
            if s.maximized {
                let _ = win.maximize();
            }
            if let Some(live) = app.try_state::<Live>() {
                *live.0.lock().unwrap() = s;
            }
        } else {
            let _ = win.center();
        }
    }
    let _ = win.show();
}

fn track_window(window: &tauri::Window, event: &WindowEvent) {
    let Some(live) = window.app_handle().try_state::<Live>() else { return };
    match event {
        WindowEvent::Resized(_) | WindowEvent::Moved(_) => {
            let mut s = live.0.lock().unwrap();
            s.maximized = window.is_maximized().unwrap_or(false);
            if !s.maximized && !window.is_minimized().unwrap_or(false) {
                if let (Ok(p), Ok(sz)) = (window.outer_position(), window.outer_size()) {
                    s.x = p.x;
                    s.y = p.y;
                    s.w = sz.width;
                    s.h = sz.height;
                }
            }
        }
        WindowEvent::CloseRequested { .. } => {
            let s = *live.0.lock().unwrap();
            if s.w > 0 {
                if let Ok(text) = serde_json::to_string(&s) {
                    let _ = write_atomic(&window_file(), &text);
                }
            }
        }
        _ => {}
    }
}

pub fn run() {
    // After a self-update: wait for the old process, then remove its leftovers.
    selfupdate::startup(TOOL_ID);
    tauri::Builder::default()
        .manage(Upd::default())
        .manage(Live(Mutex::new(WinState::default())))
        .setup(|app| {
            restore_window(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| track_window(window, event))
        .invoke_handler(tauri::generate_handler![init_state, save_json, write_text, exit_app, check_update, apply_update, update_phase, open_url])
        .run(tauri::generate_context!())
        .expect("error while running Dice Roller");
}
