mod db;
mod scout;
mod analyst;

use db::{Article, db_path, init_db, insert_article, get_articles, count_articles, prune_articles, get_settings, set_setting, get_setting};
use scout::scout_all;
use analyst::analyze_pending;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;

// ─── Shared scout state ──────────────────────────────────────────────────────

pub struct ScoutState {
    pub is_running: bool,
    pub is_analyzing: bool,
}

// ─── DB Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
fn cmd_insert_article(app: tauri::AppHandle, article: Article) -> Result<i64, String> {
    let path = db_path(&app);
    insert_article(&path, &article).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_articles(app: tauri::AppHandle, limit: i64, search: Option<String>) -> Result<Vec<Article>, String> {
    let path = db_path(&app);
    get_articles(&path, limit, search.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_count_articles(app: tauri::AppHandle) -> Result<i64, String> {
    let path = db_path(&app);
    count_articles(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_prune_articles(app: tauri::AppHandle) -> Result<usize, String> {
    let path = db_path(&app);
    let settings = get_settings(&path).map_err(|e| e.to_string())?;
    prune_articles(&path, &settings.prune_interval).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_settings(app: tauri::AppHandle) -> Result<db::DbSettings, String> {
    let path = db_path(&app);
    get_settings(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_setting(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let path = db_path(&app);
    get_setting(&path, &key).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_set_setting(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let path = db_path(&app);
    set_setting(&path, &key, &value).map_err(|e| e.to_string())
}

// ─── Scout Commands ──────────────────────────────────────────────────────────

/// Manually triggered scout — runs immediately across all active sources.
#[tauri::command]
async fn cmd_scout_now(
    app: tauri::AppHandle,
    active_sources: Vec<String>,
    state: tauri::State<'_, Arc<Mutex<ScoutState>>>,
) -> Result<usize, String> {
    {
        let mut s = state.lock().await;
        s.is_running = true;
    }
    let path = db_path(&app);
    let saved = scout_all(path, active_sources).await;
    {
        let mut s = state.lock().await;
        s.is_running = false;
    }
    // Notify frontend to refresh the article list (always — even 0 new, so UI reflects current DB)
    let _ = app.emit("articles-updated", saved);

    // After scouting, run analysis
    let anal_state = state.inner().clone();
    let anal_app = app.clone();
    tauri::async_runtime::spawn(async move {
        {
            let mut s = anal_state.lock().await;
            if s.is_analyzing { return; }
            s.is_analyzing = true;
        }
        analyze_pending(db_path(&anal_app), anal_app.clone()).await;
        {
            let mut s = anal_state.lock().await;
            s.is_analyzing = false;
        }
    });

    Ok(saved)
}

#[tauri::command]
async fn cmd_analyze_now(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<ScoutState>>>,
) -> Result<usize, String> {
    {
        let mut s = state.lock().await;
        if s.is_analyzing { return Err("Analysis already running".to_string()); }
        s.is_analyzing = true;
    }
    let count = analyze_pending(db_path(&app), app.clone()).await;
    {
        let mut s = state.lock().await;
        s.is_analyzing = false;
    }
    Ok(count)
}

#[tauri::command]
async fn cmd_scout_status(state: tauri::State<'_, Arc<Mutex<ScoutState>>>) -> Result<bool, String> {
    Ok(state.lock().await.is_running)
}

// ─── Ollama Commands ─────────────────────────────────────────────────────────

/// Returns true if the `ollama` binary is discoverable on this machine.
#[tauri::command]
async fn cmd_check_ollama() -> Result<bool, String> {
    let output = tokio::process::Command::new("which")
        .arg("ollama")
        .output()
        .await;
    Ok(output.map(|o| o.status.success()).unwrap_or(false))
}

/// Returns list of model names installed in the local Ollama instance.
#[tauri::command]
async fn cmd_get_ollama_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map_err(|_| "Ollama offline".to_string())?;
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let models = body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    Ok(models)
}

/// Returns available disk space in gigabytes for the home directory.
#[tauri::command]
async fn cmd_get_free_disk_gb() -> Result<f64, String> {
    let output = tokio::process::Command::new("df")
        .args(["-k", std::env::var("HOME").unwrap_or_else(|_| "/".into()).as_str()])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // df output: Filesystem, 512-blocks, Used, Available, Capacity, Mounted
    for line in stdout.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 4 {
            if let Ok(kb) = cols[3].parse::<f64>() {
                return Ok((kb * 1024.0) / 1_073_741_824.0); // kB → GB
            }
        }
    }
    Err("Could not determine disk space".to_string())
}

/// Pulls an Ollama model, streaming progress via `model-pull-progress` events.
/// Emits `model-pull-done { name, success }` when finished.
#[tauri::command]
async fn cmd_pull_ollama_model(app: tauri::AppHandle, name: String) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let mut child = Command::new("ollama")
        .args(["pull", &name])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let app2 = app.clone();
    let name2 = name.clone();

    // Stream stdout lines as progress events
    let stdout_task = tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app2.emit("model-pull-progress", &line);
        }
    });

    // Also capture stderr
    let app3 = app.clone();
    let stderr_task = tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app3.emit("model-pull-progress", format!("[err] {}", line));
        }
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = tokio::join!(stdout_task, stderr_task);

    let success = status.success();
    let _ = app.emit("model-pull-done", serde_json::json!({ "name": name2, "success": success }));
    Ok(())
}

// ─── Background polling loop ──────────────────────────────────────────────────

fn start_background_scout(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // ── First run: scout immediately on startup (don't wait a full interval) ──
        let path = db_path(&app);
        let saved = scout_all(path, vec![]).await;
        if saved > 0 {
            let _ = app.emit("articles-updated", saved);
        }

        // ── Then loop with the user's configured interval ───────────────────────
        loop {
            let path = db_path(&app);

            // Re-read frequency each cycle so user changes apply immediately
            let freq_mins = get_settings(&path)
                .map(|s| s.scout_frequency_mins)
                .unwrap_or(15);

            if freq_mins <= 0 {
                // Manual mode — check again in 60s
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                continue;
            }

            let wait = std::time::Duration::from_secs((freq_mins * 60) as u64);
            tokio::time::sleep(wait).await;

            let saved = scout_all(path.clone(), vec![]).await;
            if saved > 0 {
                let _ = app.emit("articles-updated", saved);
                // Also kick off analysis for new articles
                analyze_pending(path, app.clone()).await;
            }
        }
    });
}

// ─── App entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(Mutex::new(ScoutState { 
            is_running: false,
            is_analyzing: false,
        })))
        .setup(|app| {
            let path = db_path(&app.handle());
            init_db(&path).expect("Failed to initialise database");
            start_background_scout(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_insert_article,
            cmd_get_articles,
            cmd_count_articles,
            cmd_prune_articles,
            cmd_get_settings,
            cmd_get_setting,
            cmd_set_setting,
            cmd_scout_now,
            cmd_scout_status,
            cmd_analyze_now,
            cmd_check_ollama,
            cmd_get_ollama_models,
            cmd_get_free_disk_gb,
            cmd_pull_ollama_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
