use rusqlite::{Connection, params};
use rusqlite::Result as SqlResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

// ─── Data types ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Article {
    pub id: Option<i64>,
    pub title: String,
    pub url: String,
    pub source: String,
    pub impact: String,        // BULLISH | BEARISH | NEUTRAL
    pub summary: String,
    pub entities: String,      // JSON array stored as text
    pub recommendation: String,
    pub scraped_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbSettings {
    pub prune_interval: String, // "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "never"
    pub scout_frequency_mins: i64,
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

    conn.execute_batch("
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS articles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            url             TEXT NOT NULL UNIQUE,
            source          TEXT NOT NULL,
            impact          TEXT NOT NULL DEFAULT 'NEUTRAL',
            summary         TEXT NOT NULL DEFAULT '',
            entities        TEXT NOT NULL DEFAULT '[]',
            recommendation  TEXT NOT NULL DEFAULT '',
            scraped_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        INSERT OR IGNORE INTO app_settings (key, value) VALUES
            ('prune_interval',       'never'),
            ('scout_frequency_mins', '15'),
            ('ollama_model',        'qwen3.5:3b');
    ")?;

    Ok(())
}

// ─── Articles ────────────────────────────────────────────────────────────────

pub fn insert_article(path: &PathBuf, article: &Article) -> SqlResult<i64> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT OR IGNORE INTO articles (title, url, source, impact, summary, entities, recommendation)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            article.title, article.url, article.source,
            article.impact, article.summary, article.entities, article.recommendation
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

fn row_to_article(row: &rusqlite::Row<'_>) -> SqlResult<Article> {
    Ok(Article {
        id:             Some(row.get(0)?),
        title:          row.get(1)?,
        url:            row.get(2)?,
        source:         row.get(3)?,
        impact:         row.get(4)?,
        summary:        row.get(5)?,
        entities:       row.get(6)?,
        recommendation: row.get(7)?,
        scraped_at:     row.get(8)?,
    })
}

pub fn get_articles(path: &PathBuf, limit: i64, search: Option<&str>) -> SqlResult<Vec<Article>> {
    let conn = Connection::open(path)?;
    let query = search.unwrap_or("").trim().to_string();

    if query.is_empty() {
        let mut stmt = conn.prepare(
            "SELECT id, title, url, source, impact, summary, entities, recommendation, scraped_at
             FROM articles ORDER BY scraped_at DESC LIMIT ?1"
        )?;
        let rows = stmt.query_map(params![limit], row_to_article)?;
        rows.collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, url, source, impact, summary, entities, recommendation, scraped_at
             FROM articles
             WHERE title LIKE ?1 OR source LIKE ?1 OR summary LIKE ?1 OR entities LIKE ?1
             ORDER BY scraped_at DESC LIMIT ?2"
        )?;
        let like_q = format!("%{}%", query);
        let rows = stmt.query_map(params![like_q, limit], row_to_article)?;
        rows.collect()
    }
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
    Ok(DbSettings {
        prune_interval: prune,
        scout_frequency_mins: freq_str.parse().unwrap_or(15),
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
