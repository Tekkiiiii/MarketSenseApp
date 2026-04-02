use rusqlite::{Connection, params};
use rusqlite::Result as SqlResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

// chrono is re-exported from the top-level crate for internal use
#[allow(unused)] use chrono;

// ─── Data types ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Article {
    pub id: Option<i64>,
    pub title: String,
    pub url: String,
    pub source: String,
    pub impact: String,           // BULLISH | BEARISH | NEUTRAL
    pub summary: String,
    pub entities: String,         // JSON array stored as text
    pub recommendation: String,
    pub scraped_at: Option<String>,
    // Extended fields for analyst v2
    pub content: String,          // Full article text, max ~8000 chars
    pub analysis_status: String,  // "pending" | "analyzing" | "done" | "error"
    pub confidence: Option<i32>,  // 0-100
    pub key_price_factors: String, // JSON array of specific price-moving factors
    pub risk_level: Option<String>, // LOW | MEDIUM | HIGH
    pub sectors: Option<String>,  // JSON array of affected sectors
    pub tickers: Option<String>, // JSON array of exact stock codes
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbSettings {
    pub prune_interval: String,     // daily | weekly | monthly | quarterly | yearly | never
    pub scout_frequency_mins: i64,
    pub analyzer_backend: String,   // ollama | claude | tekki
}

// ─── Db path helper ───────────────────────────────────────────────────────────

pub fn db_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("could not resolve app data dir");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("marketsense.db")
}

// ─── Schema init ─────────────────────────────────────────────────────────────

pub fn init_db(path: &PathBuf) -> SqlResult<()> {
    let conn = Connection::open(path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;

    // Check if new schema columns exist
    let has_new = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('articles') WHERE name='analysis_status'",
            [],
            |row| row.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;

    if has_new {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS articles (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                title               TEXT NOT NULL,
                url                 TEXT NOT NULL UNIQUE,
                source              TEXT NOT NULL,
                impact              TEXT NOT NULL DEFAULT 'NEUTRAL',
                summary             TEXT NOT NULL DEFAULT '',
                entities            TEXT NOT NULL DEFAULT '[]',
                recommendation      TEXT NOT NULL DEFAULT '',
                scraped_at          TEXT NOT NULL DEFAULT (datetime('now')),
                content             TEXT NOT NULL DEFAULT '',
                analysis_status     TEXT NOT NULL DEFAULT 'pending',
                confidence          INTEGER,
                key_price_factors  TEXT NOT NULL DEFAULT '[]',
                risk_level          TEXT,
                sectors             TEXT,
                tickers             TEXT
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )?;
    } else {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS articles (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                title               TEXT NOT NULL,
                url                 TEXT NOT NULL UNIQUE,
                source              TEXT NOT NULL,
                impact              TEXT NOT NULL DEFAULT 'NEUTRAL',
                summary             TEXT NOT NULL DEFAULT '',
                entities            TEXT NOT NULL DEFAULT '[]',
                recommendation      TEXT NOT NULL DEFAULT '',
                scraped_at          TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )?;

        // Migration: add new columns to existing table
        let _ = conn.execute(
            "ALTER TABLE articles ADD COLUMN content TEXT NOT NULL DEFAULT ''",
            [],
        );
        let _ = conn.execute(
            "ALTER TABLE articles ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'pending'",
            [],
        );
        let _ = conn.execute("ALTER TABLE articles ADD COLUMN confidence INTEGER", []);
        let _ = conn.execute(
            "ALTER TABLE articles ADD COLUMN key_price_factors TEXT NOT NULL DEFAULT '[]'",
            [],
        );
        let _ = conn.execute("ALTER TABLE articles ADD COLUMN risk_level TEXT", []);
        let _ = conn.execute("ALTER TABLE articles ADD COLUMN sectors TEXT", []);
        let _ = conn.execute("ALTER TABLE articles ADD COLUMN tickers TEXT", []);
    }

    conn.execute_batch(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES
            ('prune_interval',        'never'),
            ('scout_frequency_mins', '15'),
            ('ollama_model',         'qwen3:4b'),
            ('analyzer_backend',      'ollama'),
            ('tekki_api_key',         ''),
            ('tekki_api_endpoint',    'https://api.tekki.vn/v1/analyze'),
            ('user_api_key',          ''),
            ('user_model',           'claude-sonnet-4-20250514'),
            ('supabase_url',          ''),
            ('supabase_anon_key',     '');",
    )?;

    // ─── Auth migration: user/subscription/session tables ─────────────────────
    let has_users = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'",
            [],
            |row| row.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;

    if !has_users {
        // user_id column on articles — NULL means pre-auth global data
        let _ = conn.execute(
            "ALTER TABLE articles ADD COLUMN user_id TEXT",
            [],
        );

        // user_id column on app_settings — NULL means pre-auth global defaults
        let _ = conn.execute(
            "ALTER TABLE app_settings ADD COLUMN user_id TEXT",
            [],
        );

        // Change article URL from UNIQUE to UNIQUE(user_id, url) so multiple users
        // can have the same article (scraped from the same source independently)
        conn.execute("DROP INDEX IF EXISTS idx_articles_url", [])?;
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_user_url ON articles(user_id, url)",
            [],
        )?;

        // users table: local mirror of Supabase auth user
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                email       TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )?;

        // sessions table: Supabase access/refresh tokens for offline auth
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                user_id        TEXT PRIMARY KEY,
                access_token   TEXT NOT NULL,
                refresh_token  TEXT NOT NULL,
                expires_at     INTEGER NOT NULL,
                email          TEXT NOT NULL
            );",
        )?;

        // subscriptions table: tier state (mirrored from Supabase)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS subscriptions (
                user_id           TEXT PRIMARY KEY,
                tier              TEXT NOT NULL DEFAULT 'starter',
                status            TEXT NOT NULL DEFAULT 'trial',
                expires_at        TEXT,
                trial_ends_at      TEXT,
                last_validated    TEXT
            );",
        )?;
    }

    Ok(())
}

// ─── Auth / User helpers ─────────────────────────────────────────────────────

/// Active-user helpers (stored in app_settings with key='active_user_id')
pub fn get_active_user_id(path: &PathBuf) -> SqlResult<Option<String>> {
    get_setting(path, "active_user_id")
}

pub fn set_active_user_id(path: &PathBuf, user_id: &str) -> SqlResult<()> {
    set_setting(path, "active_user_id", user_id)
}

pub fn clear_active_user_id(path: &PathBuf) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "DELETE FROM app_settings WHERE key='active_user_id'",
        [],
    )?;
    Ok(())
}

/// Upsert a local user record (mirrors Supabase auth.users)
pub fn upsert_user(path: &PathBuf, id: &str, email: &str) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO users (id, email) VALUES (?1, ?2)
         ON CONFLICT(id) DO UPDATE SET email=excluded.email",
        params![id, email],
    )?;
    Ok(())
}

pub fn get_user(path: &PathBuf, id: &str) -> SqlResult<Option<(String, String)>> {
    let conn = Connection::open(path)?;
    let result = conn.query_row(
        "SELECT id, email FROM users WHERE id=?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Session CRUD
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredSession {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub email: String,
}

pub fn save_session(path: &PathBuf, s: &StoredSession) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO sessions (user_id, access_token, refresh_token, expires_at, email)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(user_id) DO UPDATE SET
           access_token=excluded.access_token,
           refresh_token=excluded.refresh_token,
           expires_at=excluded.expires_at,
           email=excluded.email",
        params![s.user_id, s.access_token, s.refresh_token, s.expires_at, s.email],
    )?;
    Ok(())
}

pub fn load_session(path: &PathBuf) -> SqlResult<Option<StoredSession>> {
    let conn = Connection::open(path)?;
    let result = conn.query_row(
        "SELECT user_id, access_token, refresh_token, expires_at, email FROM sessions LIMIT 1",
        [],
        |r| Ok(StoredSession {
            user_id: r.get(0)?,
            access_token: r.get(1)?,
            refresh_token: r.get(2)?,
            expires_at: r.get(3)?,
            email: r.get(4)?,
        }),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn clear_session(path: &PathBuf) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute("DELETE FROM sessions", [])?;
    conn.execute("DELETE FROM users", [])?;
    conn.execute("DELETE FROM app_settings WHERE key='active_user_id'", [])?;
    Ok(())
}

/// Subscription helpers
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Subscription {
    pub tier: String,
    pub status: String,
    pub expires_at: Option<String>,
    pub trial_ends_at: Option<String>,
}

pub fn get_subscription(path: &PathBuf, user_id: &str) -> SqlResult<Option<Subscription>> {
    let conn = Connection::open(path)?;
    let result = conn.query_row(
        "SELECT tier, status, expires_at, trial_ends_at FROM subscriptions WHERE user_id=?1",
        params![user_id],
        |r| Ok(Subscription {
            tier: r.get(0)?,
            status: r.get(1)?,
            expires_at: r.get(2)?,
            trial_ends_at: r.get(3)?,
        }),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn upsert_subscription(path: &PathBuf, user_id: &str, sub: &Subscription) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO subscriptions (user_id, tier, status, expires_at, trial_ends_at, last_validated)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           tier=excluded.tier,
           status=excluded.status,
           expires_at=excluded.expires_at,
           trial_ends_at=excluded.trial_ends_at,
           last_validated=datetime('now')",
        params![user_id, sub.tier, sub.status, sub.expires_at, sub.trial_ends_at],
    )?;
    Ok(())
}

/// Migration: assign pre-auth (NULL user_id) data to a newly logged-in user
/// Returns (articles_migrated, settings_migrated)
pub fn migrate_anon_data(path: &PathBuf, user_id: &str) -> SqlResult<(i64, i64)> {
    let conn = Connection::open(path)?;
    let articles = conn.execute(
        "UPDATE articles SET user_id=?1 WHERE user_id IS NULL",
        params![user_id],
    )? as i64;
    let settings = conn.execute(
        "UPDATE app_settings SET user_id=?1 WHERE user_id IS NULL",
        params![user_id],
    )? as i64;
    Ok((articles, settings))
}

/// Check if there is pre-auth (user_id=NULL) data that needs migration
pub fn has_anon_data(path: &PathBuf) -> SqlResult<bool> {
    let conn = Connection::open(path)?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM articles WHERE user_id IS NULL",
        [],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

/// Create default trial subscription for a new user (called after local upsert)
pub fn create_trial_subscription(path: &PathBuf, user_id: &str) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    let trial_ends = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(7))
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
        .unwrap_or_default();
    conn.execute(
        "INSERT INTO subscriptions (user_id, tier, status, trial_ends_at, last_validated)
         VALUES (?1, 'starter', 'trial', ?2, datetime('now'))",
        params![user_id, trial_ends],
    )?;
    Ok(())
}

// ─── Articles ────────────────────────────────────────────────────────────────

pub fn get_latest_analyzed_articles(path: &PathBuf, limit: i64, search: Option<&str>) -> SqlResult<Vec<Article>> {
    let conn = Connection::open(path)?;
    let query = search.unwrap_or("").trim().to_string();
    let cols = "id, title, url, source, impact, summary, entities, recommendation,
                 scraped_at, content, analysis_status, confidence, key_price_factors,
                 risk_level, sectors, tickers";

    if query.is_empty() {
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM articles
             WHERE analysis_status = 'done'
             ORDER BY scraped_at DESC LIMIT ?1", cols
        ))?;
        let rows = stmt.query_map(params![limit], row_to_article)?;
        rows.collect()
    } else {
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM articles
             WHERE analysis_status = 'done'
               AND (title LIKE ?1 OR source LIKE ?1 OR summary LIKE ?1
                    OR entities LIKE ?1 OR tickers LIKE ?1 OR sectors LIKE ?1)
             ORDER BY scraped_at DESC LIMIT ?2", cols
        ))?;
        let like_q = format!("%{}%", query);
        let rows = stmt.query_map(params![like_q, limit], row_to_article)?;
        rows.collect()
    }
}

pub fn insert_article(path: &PathBuf, article: &Article) -> SqlResult<i64> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT OR IGNORE INTO articles
         (title, url, source, impact, summary, entities, recommendation, content, analysis_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            article.title, article.url, article.source,
            article.impact, article.summary, article.entities,
            article.recommendation, article.content, article.analysis_status,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

fn row_to_article(row: &rusqlite::Row<'_>) -> SqlResult<Article> {
    Ok(Article {
        id:              Some(row.get(0)?),
        title:           row.get(1)?,
        url:             row.get(2)?,
        source:          row.get(3)?,
        impact:          row.get(4)?,
        summary:         row.get(5)?,
        entities:        row.get(6)?,
        recommendation:  row.get(7)?,
        scraped_at:      row.get(8)?,
        content:         row.get(9)?,
        analysis_status: row.get(10)?,
        confidence:      row.get(11)?,
        key_price_factors: row.get(12)?,
        risk_level:      row.get(13)?,
        sectors:         row.get(14)?,
        tickers:         row.get(15)?,
    })
}

pub fn get_articles(path: &PathBuf, limit: i64, search: Option<&str>) -> SqlResult<Vec<Article>> {
    let conn = Connection::open(path)?;
    let query = search.unwrap_or("").trim().to_string();
    let cols = "id, title, url, source, impact, summary, entities, recommendation,
                 scraped_at, content, analysis_status, confidence, key_price_factors,
                 risk_level, sectors, tickers";

    if query.is_empty() {
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM articles ORDER BY scraped_at DESC LIMIT ?1", cols
        ))?;
        let rows = stmt.query_map(params![limit], row_to_article)?;
        rows.collect()
    } else {
        let mut stmt = conn.prepare(&format!(
            "SELECT {} FROM articles
             WHERE title LIKE ?1 OR source LIKE ?1 OR summary LIKE ?1
                   OR entities LIKE ?1 OR tickers LIKE ?1 OR sectors LIKE ?1
             ORDER BY scraped_at DESC LIMIT ?2", cols
        ))?;
        let like_q = format!("%{}%", query);
        let rows = stmt.query_map(params![like_q, limit], row_to_article)?;
        rows.collect()
    }
}

pub fn get_pending_articles(path: &PathBuf, limit: i64) -> SqlResult<Vec<Article>> {
    let conn = Connection::open(path)?;
    let cols = "id, title, url, source, impact, summary, entities, recommendation,
                 scraped_at, content, analysis_status, confidence, key_price_factors,
                 risk_level, sectors, tickers";
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM articles
         WHERE analysis_status = 'pending'
         ORDER BY scraped_at DESC LIMIT ?1", cols
    ))?;
    let rows = stmt.query_map(params![limit], row_to_article)?;
    rows.collect()
}


pub fn count_articles(path: &PathBuf) -> SqlResult<i64> {
    let conn = Connection::open(path)?;
    conn.query_row("SELECT COUNT(*) FROM articles", [], |row| row.get(0))
}

// ─── Pruning ─────────────────────────────────────────────────────────────────

pub fn prune_articles(path: &PathBuf, interval: &str) -> SqlResult<usize> {
    if interval == "never" {
        return Ok(0);
    }
    let modifier = match interval {
        "daily"     => "-1 day",
        "weekly"    => "-7 days",
        "monthly"   => "-30 days",
        "quarterly" => "-90 days",
        "yearly"    => "-365 days",
        _           => return Ok(0),
    };
    let conn = Connection::open(path)?;
    let deleted = conn.execute(
        &format!("DELETE FROM articles WHERE scraped_at < datetime('now', '{}')", modifier),
        [],
    )?;
    Ok(deleted)
}

// ─── Settings ────────────────────────────────────────────────────────────────

pub fn get_settings(path: &PathBuf) -> SqlResult<DbSettings> {
    let conn = Connection::open(path)?;
    let prune: String = conn.query_row(
        "SELECT value FROM app_settings WHERE key='prune_interval'", [], |r| r.get(0)
    )?;
    let freq_str: String = conn.query_row(
        "SELECT value FROM app_settings WHERE key='scout_frequency_mins'", [], |r| r.get(0)
    )?;
    let backend: String = conn.query_row(
        "SELECT value FROM app_settings WHERE key='analyzer_backend'", [], |r| r.get(0)
    ).unwrap_or_else(|_| "ollama".to_string());
    Ok(DbSettings {
        prune_interval: prune,
        scout_frequency_mins: freq_str.parse().unwrap_or(15),
        analyzer_backend: backend,
    })
}

pub fn set_setting(path: &PathBuf, key: &str, value: &str) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_setting(path: &PathBuf, key: &str) -> SqlResult<Option<String>> {
    let conn = Connection::open(path)?;
    let result = conn.query_row(
        "SELECT value FROM app_settings WHERE key=?1",
        params![key],
        |r| r.get(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Legacy update — kept for backward compat with existing code.
pub fn update_article_analysis(path: &PathBuf, article: &Article) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "UPDATE articles SET impact=?1, summary=?2, entities=?3, recommendation=?4 WHERE id=?5",
        params![
            article.impact, article.summary, article.entities,
            article.recommendation, article.id
        ],
    )?;
    Ok(())
}

/// Full result update from analyst
pub fn update_article_result(
    path: &PathBuf,
    article_id: i64,
    impact: &str,
    summary: &str,
    recommendation: &str,
    confidence: i32,
    key_price_factors: &[String],
    risk_level: &str,
    sectors: &[String],
    tickers: &[String],
) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    let kpf = serde_json::to_string(key_price_factors).unwrap_or_else(|_| "[]".into());
    let sec = serde_json::to_string(sectors).unwrap_or_else(|_| "[]".into());
    let tic = serde_json::to_string(tickers).unwrap_or_else(|_| "[]".into());

    conn.execute(
        "UPDATE articles SET
            impact           = ?1,
            summary          = ?2,
            recommendation   = ?3,
            analysis_status  = 'done',
            confidence       = ?4,
            key_price_factors = ?5,
            risk_level       = ?6,
            sectors          = ?7,
            tickers          = ?8
         WHERE id = ?9",
        params![
            impact, summary, recommendation,
            confidence, kpf, risk_level, sec, tic,
            article_id,
        ],
    )?;
    Ok(())
}

pub fn set_article_analysis_analyzing(path: &PathBuf, article_id: i64) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "UPDATE articles SET analysis_status='analyzing' WHERE id=?1",
        params![article_id],
    )?;
    Ok(())
}

pub fn set_article_analysis_error(path: &PathBuf, article_id: i64) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "UPDATE articles SET analysis_status='error' WHERE id=?1",
        params![article_id],
    )?;
    Ok(())
}

pub fn set_article_analysis_pending(path: &PathBuf, article_id: i64) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "UPDATE articles SET analysis_status='pending' WHERE id=?1",
        params![article_id],
    )?;
    Ok(())
}

pub fn get_supported_source_names() -> Vec<String> {
    crate::scout::SOURCES.iter().map(|s| s.name.to_string()).collect()
}

pub fn update_article_content(path: &PathBuf, id: i64, content: &str) -> SqlResult<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "UPDATE articles SET content=?1 WHERE id=?2",
        params![content, id],
    )?;
    Ok(())
}
