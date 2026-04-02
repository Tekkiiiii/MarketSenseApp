//! High-level user/auth operations that coordinate auth.rs and db.rs.
//!
//! This module provides the canonical user-facing functions used by Tauri commands.

use std::path::PathBuf;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuthResponse {
    pub user_id: String,
    pub email: String,
    pub session: crate::auth::SupabaseSession,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription: Option<crate::subscription::Subscription>,
}

// ─── Login / Register / Magic Link ───────────────────────────────────────────

/// Log in with email + password.
pub async fn login_email(
    path: &PathBuf,
    email: &str,
    password: &str,
) -> Result<AuthResponse, String> {
    let session = crate::auth::login(email, password).await?;

    // Upsert local user record
    crate::db::upsert_user(path, &session.user_id, &session.email)
        .map_err(|e| e.to_string())?;

    // Set active user
    crate::db::set_active_user_id(path, &session.user_id)
        .map_err(|e| e.to_string())?;

    // Sync subscription from Supabase
    let sub = crate::subscription::sync_and_save(path, &session.user_id, &session.access_token).await?;

    Ok(AuthResponse {
        user_id: session.user_id.clone(),
        email: session.email.clone(),
        session,
        subscription: Some(sub),
    })
}

/// Register a new account.
pub async fn register(
    path: &PathBuf,
    email: &str,
    password: &str,
) -> Result<AuthResponse, String> {
    // Sign up — creates the account
    let result = crate::auth::signup(email, password).await?;
    if let Some(err) = result.error {
        return Err(err);
    }

    // Immediately log in to get session tokens
    let session = crate::auth::login(email, password).await?;

    // Upsert local user record
    crate::db::upsert_user(path, &session.user_id, &session.email)
        .map_err(|e| e.to_string())?;

    // Set active user
    crate::db::set_active_user_id(path, &session.user_id)
        .map_err(|e| e.to_string())?;

    // Sync subscription from Supabase
    let sub = crate::subscription::sync_and_save(path, &session.user_id, &session.access_token).await?;

    Ok(AuthResponse {
        user_id: session.user_id.clone(),
        email: session.email.clone(),
        session,
        subscription: Some(sub),
    })
}

/// Request a magic link email.
pub async fn request_magic_link(email: &str) -> Result<(), String> {
    crate::auth::request_magic_link(email).await
}

/// Verify a magic link token and log in.
pub async fn verify_magic_link(
    path: &PathBuf,
    token: &str,
) -> Result<AuthResponse, String> {
    let session = crate::auth::verify_magic_link(token).await?;

    // Upsert user
    crate::db::upsert_user(path, &session.user_id, &session.email)
        .map_err(|e| e.to_string())?;

    // Set active user
    crate::db::set_active_user_id(path, &session.user_id)
        .map_err(|e| e.to_string())?;

    // Sync subscription
    let sub = crate::subscription::sync_and_save(path, &session.user_id, &session.access_token).await?;

    Ok(AuthResponse {
        user_id: session.user_id.clone(),
        email: session.email.clone(),
        session,
        subscription: Some(sub),
    })
}

/// Log out — clears local session but keeps user data.
pub fn logout(path: &PathBuf) -> Result<(), String> {
    crate::auth::clear_local(path)
}

/// Try to restore and refresh the session on app startup.
pub async fn restore_session(
    path: &PathBuf,
) -> Result<Option<AuthResponse>, String> {
    let stored: Option<crate::auth::SupabaseSession> = crate::auth::load_from_local(path)
        .map_err(|e| e.to_string())?;

    let Some(stored) = stored else {
        return Ok(None);
    };

    // If expired, try to refresh
    if stored.is_expired() {
        match crate::auth::try_refresh(&stored.to_stored_session()).await {
            Ok(new_session) => {
                crate::auth::save_to_local(path, &new_session)?;
                let sub = crate::subscription::sync_and_save(
                    path,
                    &new_session.user_id,
                    &new_session.access_token,
                )
                .await?;

                crate::db::set_active_user_id(path, &new_session.user_id).map_err(|e| e.to_string())?;

                Ok(Some(AuthResponse {
                    user_id: new_session.user_id.clone(),
                    email: new_session.email.clone(),
                    session: new_session,
                    subscription: Some(sub),
                }))
            }
            Err(_) => {
                // Refresh failed — clear expired session
                crate::auth::clear_local(path)?;
                Ok(None)
            }
        }
    } else {
        // Session still valid — revalidate subscription
        let sub = crate::subscription::sync_and_save(
            path,
            &stored.user_id,
            &stored.access_token,
        )
        .await
        .ok();

        Ok(Some(AuthResponse {
            user_id: stored.user_id.clone(),
            email: stored.email.clone(),
            session: stored,
            subscription: sub,
        }))
    }
}

// ─── Subscription ─────────────────────────────────────────────────────────────

/// Get the current subscription for a user.
pub fn get_subscription(path: &PathBuf, user_id: &str) -> Result<Option<crate::subscription::Subscription>, String> {
    let db_sub = crate::db::get_subscription(path, user_id)
        .map_err(|e| e.to_string())?;
    Ok(db_sub.map(|s| crate::subscription::Subscription::from_db(&s)))
}

/// Validate the current user's tier access.
pub fn validate_license(path: &PathBuf, user_id: &str) -> Result<crate::subscription::TierAccess, String> {
    crate::subscription::validate_tier(path, user_id)
}

/// Revalidate subscription from Supabase (called periodically).
pub async fn revalidate_subscription(
    path: &PathBuf,
    user_id: &str,
) -> Result<Option<crate::subscription::Subscription>, String> {
    let session: crate::auth::SupabaseSession = crate::auth::load_from_local(path)
        .map_err(|e| e.to_string())?
        .ok_or("No active session")?;

    let sub = crate::subscription::sync_and_save(path, user_id, &session.access_token).await?;
    Ok(Some(sub))
}

// ─── Data migration ───────────────────────────────────────────────────────────

/// Migrate pre-auth data (user_id=NULL) to the current user.
pub fn migrate_anon_data(path: &PathBuf, user_id: &str) -> Result<(i64, i64), String> {
    crate::db::migrate_anon_data(path, user_id).map_err(|e| e.to_string())
}

/// Check if pre-auth data exists (for "Claim My Data" banner).
pub fn has_anon_data(path: &PathBuf) -> Result<bool, String> {
    crate::db::has_anon_data(path).map_err(|e| e.to_string())
}
