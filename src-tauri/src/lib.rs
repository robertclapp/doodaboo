use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Default vault location: $DOODABOO_VAULT or ~/.doodaboo.
fn default_vault_root() -> PathBuf {
    if let Ok(env) = std::env::var("DOODABOO_VAULT") {
        return PathBuf::from(env);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".doodaboo")
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultPaths {
    root: String,
    workspace_file: String,
    backups_dir: String,
    plugins_dir: String,
    exports_dir: String,
}

fn vault_paths(root: PathBuf) -> VaultPaths {
    VaultPaths {
        root: root.display().to_string(),
        workspace_file: root.join("workspace.json").display().to_string(),
        backups_dir: root.join("backups").display().to_string(),
        plugins_dir: root.join("plugins").display().to_string(),
        exports_dir: root.join("exports").display().to_string(),
    }
}

#[tauri::command]
fn vault_root() -> VaultPaths {
    vault_paths(default_vault_root())
}

/// Read the vault's workspace.json. Returns null when no vault exists yet
/// so the front-end can render an onboarding screen instead of crashing.
#[tauri::command]
fn vault_load() -> Result<Option<serde_json::Value>, String> {
    let path = default_vault_root().join("workspace.json");
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|e| format!("workspace.json is not valid JSON: {e}")),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("failed to read {}: {err}", path.display())),
    }
}

/// Atomic write: temp-file-then-rename so a crash never produces a
/// half-written workspace.json. Mirrors the Node-side primitive in
/// src/lib/vault.ts.
#[tauri::command]
fn vault_save(state: serde_json::Value) -> Result<(), String> {
    let root = default_vault_root();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let target = root.join("workspace.json");
    let tmp = root.join(format!("workspace.json.tmp-{}", std::process::id()));
    let payload = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&tmp, &payload).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;

    // Best-effort rolling backup.
    let backups = root.join("backups");
    let _ = fs::create_dir_all(&backups);
    let stamp = chrono_like_stamp();
    let _ = fs::write(backups.join(format!("workspace-{stamp}.json")), &payload);
    Ok(())
}

#[tauri::command]
fn vault_init() -> Result<VaultPaths, String> {
    let root = default_vault_root();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("backups")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("plugins")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("exports")).map_err(|e| e.to_string())?;
    Ok(vault_paths(root))
}

/// SystemTime → "YYYY-MM-DDTHH-MM-SS" without pulling in chrono.
fn chrono_like_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Convert to UTC-ish. Good enough for filesystem-safe ordering.
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let hours = rem / 3600;
    let minutes = (rem % 3600) / 60;
    let seconds = rem % 60;
    let (y, m, d) = epoch_days_to_ymd(days as i64);
    format!("{y:04}-{m:02}-{d:02}T{hours:02}-{minutes:02}-{seconds:02}")
}

/// Days-since-epoch → (year, month, day). Pure integer math, no deps.
fn epoch_days_to_ymd(mut days: i64) -> (i32, u32, u32) {
    days += 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let doe = (days - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64 + era * 400) as i32;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let yr = if m <= 2 { y + 1 } else { y };
    (yr, m, d)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            vault_root,
            vault_load,
            vault_save,
            vault_init
        ])
        .setup(|app| {
            // Make sure the vault scaffolding exists on first launch.
            if let Err(err) = vault_init() {
                eprintln!("[doodaboo] vault_init failed at startup: {err}");
            }
            // Window setup is delegated to tauri.conf.json. Surface the
            // resolved vault root in the window title for clarity.
            if let Some(window) = app.get_webview_window("main") {
                let paths = vault_root();
                let _ = window.set_title(&format!("Doodaboo — {}", paths.root));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
