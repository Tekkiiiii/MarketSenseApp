//! Subscription tier validation and Supabase sync for MarketSense VN.
//!
//! Subscription state is mirrored locally in SQLite (source of truth for offline).
//! Supabase is queried at startup and periodically for revalidation.
//!
//! Tier model:
//!   - starter: free, limited features
//!   - pro: paid, most features
//!   - elite: paid, all features

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Starter,
    Pro,
    Elite,
}

impl Tier {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "pro" => Tier::Pro,
            "elite" => Tier::Elite,
            _ => Tier::Starter,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Tier::Starter => "starter",
            Tier::Pro => "pro",
            Tier::Elite => "elite",
        }
    }

    pub fn as_db_str(&self) -> String {
        self.as_str().to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SubStatus {
    Trial,
    Active,
    Expired,
}

impl SubStatus {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "active" => SubStatus::Active,
            "expired" => SubStatus::Expired,
            _ => SubStatus::Trial,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            SubStatus::Trial => "trial",
            SubStatus::Active => "active",
            SubStatus::Expired => "expired",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub tier: Tier,
    pub status: SubStatus,
    pub expires_at: Option<String>,
    pub trial_ends_at: Option<String>,
}

impl Subscription {
    pub fn default_trial(_user_id: &str) -> Self {
        let trial_ends = chrono::Utc::now()
            .checked_add_signed(chrono::Duration::days(7))
            .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
            .unwrap_or_default();
        Subscription {
            tier: Tier::Starter,
            status: SubStatus::Trial,
            expires_at: None,
            trial_ends_at: Some(trial_ends),
        }
    }

    pub fn to_db(&self) -> crate::db::Subscription {
        crate::db::Subscription {
            tier: self.tier.as_db_str(),
            status: self.status.as_str().to_string(),
            expires_at: self.expires_at.clone(),
            trial_ends_at: self.trial_ends_at.clone(),
        }
    }

    pub fn from_db(db: &crate::db::Subscription) -> Self {
        Subscription {
            tier: Tier::from_str(&db.tier),
            status: SubStatus::from_str(&db.status),
            expires_at: db.expires_at.clone(),
            trial_ends_at: db.trial_ends_at.clone(),
        }
    }
}

// ─── Feature access ───────────────────────────────────────────────────────────

/// Describes what a given tier can and cannot do.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierAccess {
    pub tier_name: String,
    // Scout limits
    pub min_scout_frequency_mins: i64, // 0 = disabled, lower = more frequent
    pub can_auto_scout: bool,
    // Source/article limits
    pub max_sources: i32,
    pub max_tickers: i32,
    pub max_analyses_per_day: i32,
    // Feature flags
    pub can_export: bool,
    pub can_broker_recs: bool,
    pub can_alerts: bool,
    pub can_custom_rss: bool,
    // Tier display
    pub is_paid: bool,
}

impl TierAccess {
    pub fn for_tier(tier: &Tier, status: &SubStatus) -> Self {
        let (min_freq, max_sources, max_tickers, max_analyses, can_export, can_broker, can_alerts, can_custom, is_paid) = match tier {
            Tier::Elite => (1, -1, -1, -1, true, true, true, true, true),
            Tier::Pro => (5, 10, 20, 100, true, false, false, true, true),
            Tier::Starter => {
                let paid = *status != SubStatus::Trial;
                if paid {
                    (15, 3, 3, 10, false, false, false, false, false)
                } else {
                    // Trial users get Pro features for 7 days
                    (5, 10, 20, 100, true, false, false, true, false)
                }
            }
        };
        TierAccess {
            tier_name: tier.as_str().to_string(),
            min_scout_frequency_mins: min_freq,
            can_auto_scout: min_freq > 0,
            max_sources,
            max_tickers,
            max_analyses_per_day: max_analyses,
            can_export,
            can_broker_recs: can_broker,
            can_alerts,
            can_custom_rss: can_custom,
            is_paid,
        }
    }

    pub fn is_feature_available(&self, feature: &str) -> bool {
        match feature {
            "export" => self.can_export,
            "broker_recs" => self.can_broker_recs,
            "alerts" => self.can_alerts,
            "custom_rss" => self.can_custom_rss,
            "auto_scout" => self.can_auto_scout,
            _ => true,
        }
    }

    pub fn validate_frequency(&self, requested_mins: i64) -> i64 {
        if requested_mins == 0 { return 0; } // Manual = always allowed
        if requested_mins < self.min_scout_frequency_mins {
            return self.min_scout_frequency_mins;
        }
        requested_mins
    }
}

// ─── Supabase sync ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SupabaseSubRow {
    tier: String,
    status: String,
    #[serde(rename = "expires_at")]
    expires_at: Option<String>,
    #[serde(rename = "trial_ends_at")]
    trial_ends_at: Option<String>,
}

/// Fetch subscription state from Supabase for a given user.
/// Falls back to local state if Supabase is unreachable.
pub async fn fetch_from_supabase(
    user_id: &str,
    access_token: &str,
) -> Result<Subscription, String> {
    let url = format!(
        "{}/rest/v1/subscriptions?user_id=eq.{}&select=tier,status,expires_at,trial_ends_at",
        crate::auth::supabase_url(),
        user_id
    );
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header("apikey", crate::auth::supabase_anon_key())
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Supabase returned {}", res.status()));
    }

    let rows: Vec<SupabaseSubRow> = res.json().await.map_err(|e| format!("Parse error: {}", e))?;

    match rows.into_iter().next() {
        Some(row) => Ok(Subscription {
            tier: Tier::from_str(&row.tier),
            status: SubStatus::from_str(&row.status),
            expires_at: row.expires_at,
            trial_ends_at: row.trial_ends_at,
        }),
        None => Ok(Subscription::default_trial(user_id)),
    }
}

/// Sync subscription from Supabase and save locally.
pub async fn sync_and_save(
    path: &PathBuf,
    user_id: &str,
    access_token: &str,
) -> Result<Subscription, String> {
    // Load local state and convert to subscription::Subscription
    let local_sub: Subscription = match crate::db::get_subscription(path, user_id).map_err(|e| e.to_string())? {
        Some(db_sub) => Subscription::from_db(&db_sub),
        None => Subscription::default_trial(user_id),
    };

    // Check trial expiration on the converted subscription
    let mut effective = local_sub.clone();
    if effective.status == SubStatus::Trial {
        if let Some(ref trial_end) = effective.trial_ends_at {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trial_end) {
                if dt < chrono::Utc::now() {
                    effective.status = SubStatus::Expired;
                }
            }
        }
    }

    // Try to fetch from Supabase for latest state
    match fetch_from_supabase(user_id, access_token).await {
        Ok(remote) => {
            effective = remote;
        }
        Err(_) => {
            // Offline — keep local state, trust it
        }
    }

    crate::db::upsert_subscription(path, user_id, &effective.to_db()).map_err(|e| e.to_string())?;
    Ok(effective)
}

/// Validate and get tier access for a user (local-first).
pub fn validate_tier(path: &PathBuf, user_id: &str) -> Result<TierAccess, String> {
    // Load local state and convert to subscription::Subscription
    let sub: Subscription = match crate::db::get_subscription(path, user_id).map_err(|e| e.to_string())? {
        Some(db_sub) => Subscription::from_db(&db_sub),
        None => Subscription::default_trial(user_id),
    };

    // Check trial expiration
    let effective_tier = sub.tier.clone();
    let effective_status = if sub.status == SubStatus::Trial {
        if let Some(ref trial_end) = sub.trial_ends_at {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trial_end) {
                if dt < chrono::Utc::now() {
                    SubStatus::Expired
                } else {
                    SubStatus::Trial
                }
            } else {
                SubStatus::Trial
            }
        } else {
            SubStatus::Trial
        }
    } else {
        sub.status.clone()
    };

    Ok(TierAccess::for_tier(&effective_tier, &effective_status))
}
