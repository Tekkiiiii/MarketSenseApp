mod db;
mod scout;
mod analyst;
mod auth;
mod subscription;
mod user_db;

use db::{Article, db_path, init_db, insert_article, get_articles, get_latest_analyzed_articles, count_articles, prune_articles, get_settings, set_setting, get_setting, get_supported_source_names, set_article_analysis_pending};
use scout::scout_all;
use analyst::analyze_pending;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;

// ─── Shared scout state ──────────────────────────────────────────────────────

pub struct ScoutState {
    pub is_running: bool,
    pub is_analyzing: bool,
    pub current_user_id: Option<String>, // Set on login, cleared on logout
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
fn cmd_get_latest_analyzed_articles(app: tauri::AppHandle, limit: i64, search: Option<String>) -> Result<Vec<Article>, String> {
    let path = db_path(&app);
    get_latest_analyzed_articles(&path, limit, search.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_supported_sources() -> Result<Vec<String>, String> {
    Ok(get_supported_source_names())
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

// ─── Source resolution helpers ────────────────────────────────────────────────

fn load_active_source_names(path: &std::path::PathBuf) -> Vec<String> {
    let raw = match get_setting(path, "sources_v1") {
        Ok(Some(v)) => v,
        _ => return vec![],
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    parsed
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let active = item.get("active").and_then(|v| v.as_bool()).unwrap_or(false);
                    let name = item.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
                    if active { name } else { None }
                })
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}

fn resolve_active_sources(path: &std::path::PathBuf, override_sources: &[String]) -> Vec<String> {
    if !override_sources.is_empty() {
        return override_sources.to_vec();
    }
    load_active_source_names(path)
}

// ─── Shared emit helper ──────────────────────────────────────────────────────

fn emit_articles_updated(app: &tauri::AppHandle, count: usize) {
    let _ = app.emit("articles-updated", count);
}

fn emit_scout_started(app: &tauri::AppHandle) {
    let _ = app.emit("scout-started", ());
}

// ─── Async helpers ────────────────────────────────────────────────────────────

fn spawn_analyze_if_idle(app: tauri::AppHandle, state_arc: Arc<Mutex<ScoutState>>) {
    tauri::async_runtime::spawn(async move {
        {
            let mut s = state_arc.lock().await;
            if s.is_analyzing { return; }
            s.is_analyzing = true;
        }

        let analyzed_count = analyze_pending(db_path(&app), app.clone()).await;
        if analyzed_count > 0 {
            emit_articles_updated(&app, analyzed_count);
        }

        {
            let mut s = state_arc.lock().await;
            s.is_analyzing = false;
        }
    });
}

fn spawn_scout_then_analyze(app: tauri::AppHandle, state_arc: Arc<Mutex<ScoutState>>) {
    tauri::async_runtime::spawn(async move {
        {
            let mut s = state_arc.lock().await;
            if s.is_running { return; }
            s.is_running = true;
        }

        let path = db_path(&app);
        let active_sources = resolve_active_sources(&path, &[]);
        let saved = scout_all(path, active_sources).await;

        {
            let mut s = state_arc.lock().await;
            s.is_running = false;
        }

        emit_articles_updated(&app, saved);
        spawn_analyze_if_idle(app, state_arc);
    });
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
    emit_scout_started(&app);
    let path = db_path(&app);
    let resolved_sources = resolve_active_sources(&path, &active_sources);
    let saved = scout_all(path, resolved_sources).await;
    {
        let mut s = state.lock().await;
        s.is_running = false;
    }
    emit_articles_updated(&app, saved);

    let anal_state = state.inner().clone();
    spawn_analyze_if_idle(app.clone(), anal_state);

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
    if count > 0 {
        emit_articles_updated(&app, count);
    }
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

// ─── Retry Analysis ──────────────────────────────────────────────────────────

/// Resets an article to 'pending' and triggers re-analysis.
#[tauri::command]
async fn cmd_retry_analysis(
    app: tauri::AppHandle,
    article_id: i64,
    state: tauri::State<'_, Arc<Mutex<ScoutState>>>,
) -> Result<(), String> {
    let path = db_path(&app);
    set_article_analysis_pending(&path, article_id).map_err(|e| e.to_string())?;
    spawn_analyze_if_idle(app, state.inner().clone());
    Ok(())
}

// ─── Ollama Commands ─────────────────────────────────────────────────────────

/// Returns true if the `ollama` binary is discoverable on this machine.
#[cfg(target_os = "windows")]
async fn find_ollama() -> bool {
    tokio::process::Command::new("where")
        .arg("ollama")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
async fn find_ollama() -> bool {
    tokio::process::Command::new("which")
        .arg("ollama")
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
async fn cmd_check_ollama() -> Result<bool, String> {
    Ok(find_ollama().await)
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
#[cfg(target_os = "windows")]
async fn get_free_disk_gb_impl() -> Result<f64, String> {
    let output = tokio::process::Command::new("wmic")
        .args(["logicaldisk", "get", "FreeSpace,Size", "/format:value"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut free_bytes: u64 = 0;
    for line in stdout.lines() {
        if line.starts_with("FreeSpace=") {
            if let Ok(v) = line.trim_start_matches("FreeSpace=").parse::<u64>() {
                free_bytes = v;
                break;
            }
        }
    }
    if free_bytes == 0 {
        return Err("Could not determine free disk space on Windows".to_string());
    }
    Ok(free_bytes as f64 / 1_073_741_824.0)
}

#[cfg(not(target_os = "windows"))]
async fn get_free_disk_gb_impl() -> Result<f64, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());
    let output = tokio::process::Command::new("df")
        .args(["-k", &home])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 4 {
            if let Ok(kb) = cols[3].parse::<f64>() {
                return Ok((kb * 1024.0) / 1_073_741_824.0);
            }
        }
    }
    Err("Could not determine disk space".to_string())
}

#[tauri::command]
async fn cmd_get_free_disk_gb() -> Result<f64, String> {
    get_free_disk_gb_impl().await
}

/// Pulls an Ollama model, streaming progress via `model-pull-progress` events.
/// Emits `model-pull-done { name, success }` when finished.
/// Uses polling instead of stdout piping (broken inside Tauri sandbox).
#[tauri::command]
async fn cmd_pull_ollama_model(app: tauri::AppHandle, name: String) -> Result<(), String> {
    use tokio::process::Command;

    // Spawn detached — we don't pipe stdout/stderr, they go to /dev/null
    let _child = Command::new("ollama")
        .args(["pull", &name])
        .spawn()
        .map_err(|e| e.to_string())?;

    // Return immediately so frontend doesn't hang
    let app_clone = app.clone();
    let model_name = name.clone();
    let poll_count_max = 60; // 5 min timeout (60 × 5s)

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let mut poll_count = 0;

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            poll_count += 1;

            // Check if model is now installed
            match client.get("http://localhost:11434/api/tags").send().await {
                Ok(res) => {
                    if let Ok(body) = res.json::<serde_json::Value>().await {
                        let models = body.get("models").and_then(|m| m.as_array());
                        if let Some(arr) = models {
                            let found = arr.iter().any(|m| {
                                m.get("name")
                                    .and_then(|n| n.as_str())
                                    .map(|s| s.starts_with(&model_name))
                                    .unwrap_or(false)
                            });
                            if found {
                                let _ = app_clone.emit("model-pull-done", serde_json::json!({
                                    "name": model_name,
                                    "success": true
                                }));
                                return;
                            }
                        }
                    }
                }
                Err(_) => {}
            }

            let _ = app_clone.emit("model-pull-progress", &format!(
                "Downloading... (checking again in 5s)"
            ));

            if poll_count >= poll_count_max {
                let _ = app_clone.emit("model-pull-done", serde_json::json!({
                    "name": model_name,
                    "success": false
                }));
                return;
            }
        }
    });

    Ok(())
}

// ─── Background polling loop ──────────────────────────────────────────────────

fn start_background_refresh_loop(app: tauri::AppHandle, state_arc: Arc<Mutex<ScoutState>>) {
    tauri::async_runtime::spawn(async move {
        // First run: scout immediately on startup, then analyze
        spawn_scout_then_analyze(app.clone(), state_arc.clone());

        loop {
            let path = db_path(&app);
            let freq_mins = get_settings(&path)
                .map(|s| s.scout_frequency_mins)
                .unwrap_or(15);

            if freq_mins <= 0 {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                continue;
            }

            let wait = std::time::Duration::from_secs((freq_mins * 60) as u64);
            tokio::time::sleep(wait).await;
            spawn_scout_then_analyze(app.clone(), state_arc.clone());
        }
    });
}

// ─── Auth Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn cmd_register(
    app: tauri::AppHandle,
    email: String,
    password: String,
) -> Result<user_db::AuthResponse, String> {
    let path = db_path(&app);
    user_db::register(&path, &email, &password).await
}

#[tauri::command]
async fn cmd_login(
    app: tauri::AppHandle,
    email: String,
    password: String,
) -> Result<user_db::AuthResponse, String> {
    let path = db_path(&app);
    user_db::login_email(&path, &email, &password).await
}

#[tauri::command]
async fn cmd_request_magic_link(email: String) -> Result<(), String> {
    user_db::request_magic_link(&email).await
}

#[tauri::command]
async fn cmd_verify_magic_link(
    app: tauri::AppHandle,
    token: String,
) -> Result<user_db::AuthResponse, String> {
    let path = db_path(&app);
    user_db::verify_magic_link(&path, &token).await
}

#[tauri::command]
async fn cmd_logout(app: tauri::AppHandle) -> Result<(), String> {
    let path = db_path(&app);
    user_db::logout(&path)
}

#[tauri::command]
async fn cmd_get_session(app: tauri::AppHandle) -> Result<Option<auth::SupabaseSession>, String> {
    let path = db_path(&app);
    user_db::restore_session(&path).await.map(|r| r.map(|a| a.session))
}

#[tauri::command]
async fn cmd_get_subscription(app: tauri::AppHandle) -> Result<Option<subscription::Subscription>, String> {
    let path = db_path(&app);
    let user_id = db::get_active_user_id(&path).map_err(|e| e.to_string())?;
    match user_id {
        Some(uid) => user_db::get_subscription(&path, &uid),
        None => Ok(None),
    }
}

#[tauri::command]
async fn cmd_validate_license(app: tauri::AppHandle) -> Result<subscription::TierAccess, String> {
    let path = db_path(&app);
    let user_id = db::get_active_user_id(&path).map_err(|e| e.to_string())?;
    match user_id {
        Some(uid) => user_db::validate_license(&path, &uid),
        None => Ok(subscription::TierAccess::for_tier(&subscription::Tier::Starter, &subscription::SubStatus::Trial)),
    }
}

#[tauri::command]
async fn cmd_migrate_user_data(app: tauri::AppHandle) -> Result<(i64, i64), String> {
    let path = db_path(&app);
    let user_id = db::get_active_user_id(&path).map_err(|e| e.to_string())?;
    match user_id {
        Some(uid) => user_db::migrate_anon_data(&path, &uid),
        None => Err("Not logged in".to_string()),
    }
}

#[tauri::command]
async fn cmd_check_has_anon_data(app: tauri::AppHandle) -> Result<bool, String> {
    let path = db_path(&app);
    user_db::has_anon_data(&path)
}

#[tauri::command]
async fn cmd_revalidate_subscription(app: tauri::AppHandle) -> Result<Option<subscription::Subscription>, String> {
    let path = db_path(&app);
    let user_id = db::get_active_user_id(&path).map_err(|e| e.to_string())?;
    match user_id {
        Some(uid) => user_db::revalidate_subscription(&path, &uid).await,
        None => Err("Not logged in".to_string()),
    }
}

// ─── App entry ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state = Arc::new(Mutex::new(ScoutState {
        is_running: false,
        is_analyzing: false,
        current_user_id: None,
    }));
    let bg_state = shared_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(shared_state)
        .setup(move |app| {
            let path = db_path(&app.handle());
            init_db(&path).expect("Failed to initialise database");
            start_background_refresh_loop(app.handle().clone(), bg_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_insert_article,
            cmd_get_articles,
            cmd_get_latest_analyzed_articles,
            cmd_get_supported_sources,
            cmd_count_articles,
            cmd_prune_articles,
            cmd_get_settings,
            cmd_get_setting,
            cmd_set_setting,
            cmd_scout_now,
            cmd_scout_status,
            cmd_analyze_now,
            cmd_retry_analysis,
            cmd_check_ollama,
            cmd_get_ollama_models,
            cmd_get_free_disk_gb,
            cmd_pull_ollama_model,
            // Auth
            cmd_register,
            cmd_login,
            cmd_request_magic_link,
            cmd_verify_magic_link,
            cmd_logout,
            cmd_get_session,
            cmd_get_subscription,
            cmd_validate_license,
            cmd_migrate_user_data,
            cmd_check_has_anon_data,
            cmd_revalidate_subscription,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
