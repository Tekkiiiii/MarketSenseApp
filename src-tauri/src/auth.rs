//! Supabase Auth REST API client for MarketSense VN.
//!
//! Uses reqwest to call the Supabase Auth endpoints directly.
//! Sessions are stored locally in SQLite for offline access.
//!
//! Auth flow:
//!   1. User registers/logs in via email+password or magic link
//!   2. Supabase returns session (access_token, refresh_token, expires_at, user_id)
//!   3. We store the session in local SQLite (sessions table)
//!   4. On subsequent app launches, we load the session and try to refresh it

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseSession {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64, // Unix timestamp
    pub email: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResult {
    pub user_id: Option<String>,
    pub email: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SupabaseTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    #[serde(rename = "expires_at")]
    supabase_expires_at: Option<i64>,
    user: SupabaseUser,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    id: String,
    email: String,
}

#[derive(Debug, Deserialize)]
struct SupabaseSignupResponse {
    id: String,
    email: String,
}

#[derive(Debug, Deserialize)]
struct SupabaseUserResponse {
    id: String,
    email: String,
}

// ─── Config ───────────────────────────────────────────────────────────────────

/// Reads Supabase URL from app_settings, falling back to env vars.
pub fn supabase_url() -> String {
    std::env::var("SUPABASE_URL").unwrap_or_default()
}

/// Reads Supabase anon key from app_settings, falling back to env vars.
pub fn supabase_anon_key() -> String {
    std::env::var("SUPABASE_ANON_KEY").unwrap_or_default()
}

fn auth_url() -> String {
    format!("{}/auth/v1", supabase_url())
}

fn rest_url() -> String {
    format!("{}/rest/v1", supabase_url())
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async fn http_post<T: for<'de> Deserialize<'de>>(
    url: &str,
    body: serde_json::Value,
    api_key: Option<&str>,
) -> Result<T, String> {
    let client = reqwest::Client::new();
    let mut req = client.post(url);
    req = req.header("apikey", supabase_anon_key());
    req = req.header("Content-Type", "application/json");
    if let Some(key) = api_key {
        req = req.header("Authorization", format!("Bearer {}", key));
    }
    let res = req.json(&body).send().await.map_err(|e| {
        if e.is_connect() {
            "Cannot connect to Supabase. Check your internet connection.".to_string()
        } else {
            format!("Request failed: {}", e)
        }
    })?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        // Parse Supabase error format
        if let Ok(err) = serde_json::from_str::<serde_json::Value>(&body) {
            let msg = err.get("msg").or(err.get("error_description")).or(err.get("error")).and_then(|v| v.as_str()).unwrap_or("Authentication failed");
            return Err(msg.to_string());
        }
        return Err(format!("HTTP {}: {}", status, body));
    }
    res.json().await.map_err(|e| format!("Failed to parse response: {}", e))
}

async fn http_get<T: for<'de> Deserialize<'de>>(
    url: &str,
    api_key: &str,
) -> Result<T, String> {
    let client = reqwest::Client::new();
    let res = client
        .get(url)
        .header("apikey", supabase_anon_key())
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }
    res.json().await.map_err(|e| format!("Failed to parse response: {}", e))
}

// ─── Core Auth API ────────────────────────────────────────────────────────────

/// Register a new user with email + password.
pub async fn signup(email: &str, password: &str) -> Result<AuthResult, String> {
    let body = serde_json::json!({
        "email": email,
        "password": password,
    });
    let res: SupabaseSignupResponse = http_post(
        &format!("{}/signup", auth_url()),
        body,
        None,
    )
    .await?;
    Ok(AuthResult {
        user_id: Some(res.id),
        email: Some(res.email),
        error: None,
    })
}

/// Log in with email + password. Returns a session with tokens for storage.
pub async fn login(email: &str, password: &str) -> Result<SupabaseSession, String> {
    let body = serde_json::json!({
        "email": email,
        "password": password,
    });
    let res: SupabaseTokenResponse = http_post(
        &format!("{}/token?grant_type=password", auth_url()),
        body,
        None,
    )
    .await?;
    Ok(SupabaseSession::from_token_response(res))
}

/// Request a magic link email.
pub async fn request_magic_link(email: &str) -> Result<(), String> {
    let body = serde_json::json!({
        "email": email,
        "redirect_to": "marketsense://auth/callback",
    });
    let _: serde_json::Value = http_post(
        &format!("{}/magiclink", auth_url()),
        body,
        None,
    )
    .await?;
    Ok(())
}

/// Verify a magic link token (exchange token for session).
pub async fn verify_magic_link(token: &str) -> Result<SupabaseSession, String> {
    let body = serde_json::json!({
        "token": token,
        "type": "magiclink",
    });
    let res: SupabaseTokenResponse = http_post(
        &format!("{}/verify", auth_url()),
        body,
        None,
    )
    .await?;
    Ok(SupabaseSession::from_token_response(res))
}

/// Refresh an expired session using a refresh token.
pub async fn refresh_session(refresh_token: &str) -> Result<SupabaseSession, String> {
    let body = serde_json::json!({
        "refresh_token": refresh_token,
    });
    let res: SupabaseTokenResponse = http_post(
        &format!("{}/token?grant_type=refresh_token", auth_url()),
        body,
        None,
    )
    .await?;

    let expires_at = res.supabase_expires_at.unwrap_or_else(|| {
        chrono::Utc::now()
            .checked_add_signed(chrono::Duration::seconds(res.expires_in))
            .map(|dt| dt.timestamp())
            .unwrap_or(0)
    });

    Ok(SupabaseSession {
        user_id: res.user.id,
        access_token: res.access_token,
        refresh_token: res.refresh_token,
        expires_at,
        email: res.user.email,
    })
}

/// Fetch user metadata from Supabase using the current access token.
pub async fn get_user(access_token: &str) -> Result<(String, String), String> {
    let res: SupabaseUserResponse = http_get(
        &format!("{}/users?select=id,email", rest_url()),
        access_token,
    )
    .await?;
    Ok((res.id, res.email))
}

// ─── Session utilities ────────────────────────────────────────────────────────

impl SupabaseSession {
    /// Convert a SupabaseTokenResponse into a SupabaseSession.
    pub fn from_token_response(res: SupabaseTokenResponse) -> Self {
        let expires_at = res.supabase_expires_at.unwrap_or_else(|| {
            chrono::Utc::now()
                .checked_add_signed(chrono::Duration::seconds(res.expires_in))
                .map(|dt| dt.timestamp())
                .unwrap_or(0)
        });
        SupabaseSession {
            user_id: res.user.id,
            access_token: res.access_token,
            refresh_token: res.refresh_token,
            expires_at,
            email: res.user.email,
        }
    }

    /// Convert into a db::StoredSession for local persistence.
    pub fn to_stored_session(&self) -> crate::db::StoredSession {
        crate::db::StoredSession {
            user_id: self.user_id.clone(),
            access_token: self.access_token.clone(),
            refresh_token: self.refresh_token.clone(),
            expires_at: self.expires_at,
            email: self.email.clone(),
        }
    }

    /// Check if the session has expired (comparing against current Unix time).
    pub fn is_expired(&self) -> bool {
        let now = chrono::Utc::now().timestamp();
        self.expires_at < now
    }
}

/// Try to refresh the stored session. Returns the new session if successful.
pub async fn try_refresh(stored: &crate::db::StoredSession) -> Result<SupabaseSession, String> {
    if stored.refresh_token.is_empty() {
        return Err("No refresh token available".to_string());
    }
    refresh_session(&stored.refresh_token).await
}

/// Save session to local SQLite.
pub fn save_to_local(path: &PathBuf, session: &SupabaseSession) -> Result<(), String> {
    crate::db::save_session(path, &session.to_stored_session())
        .map_err(|e| e.to_string())
}

/// Load session from local SQLite.
pub fn load_from_local(path: &PathBuf) -> Result<Option<SupabaseSession>, String> {
    let stored = crate::db::load_session(path).map_err(|e| e.to_string())?;
    Ok(stored.map(|s| SupabaseSession {
        user_id: s.user_id,
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
        email: s.email,
    }))
}

/// Clear session from local SQLite.
pub fn clear_local(path: &PathBuf) -> Result<(), String> {
    crate::db::clear_session(path).map_err(|e| e.to_string())
}
