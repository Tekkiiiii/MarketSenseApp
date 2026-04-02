use crate::db::{Article, insert_article};
use reqwest::Client;
use scraper::Html;
use std::path::PathBuf;

// ─── RSS feed configs per source ─────────────────────────────────────────────

#[derive(Clone)]
pub struct SourceConfig {
    pub name: &'static str,
    pub rss_url: &'static str,
}

pub const SOURCES: &[SourceConfig] = &[
    SourceConfig {
        name: "CafeF",
        rss_url: "https://cafef.vn/thi-truong-chung-khoan.rss", // Removing /rss/ suffix which 404s
    },
    SourceConfig {
        name: "Vietstock",
        rss_url: "https://vietstock.vn/rss/chung-khoan.rss",
    },
    SourceConfig {
        name: "VnEconomy",
        rss_url: "https://vneconomy.vn/chung-khoan.rss",
    },
    SourceConfig {
        name: "VNExpress Kinh Doanh",
        rss_url: "https://vnexpress.net/rss/kinh-doanh.rss",
    },
    SourceConfig {
        name: "Báo Đầu Tư",
        rss_url: "https://baodautu.vn/rss/chung-khoan.rss",
    },
    SourceConfig {
        name: "Tin Nhanh Chứng Khoán",
        rss_url: "https://bds.tinnhanhchungkhoan.vn/rss/chung-khoan-7.rss", // Specific sub-feed
    },
];

// ─── RSS item ─────────────────────────────────────────────────────────────────

#[derive(Debug)]
struct RssItem {
    title: String,
    url: String,
    description: String,
}

// ─── Parse RSS XML ────────────────────────────────────────────────────────────

fn parse_rss(xml: &str) -> Vec<RssItem> {
    let mut items = Vec::new();
    let mut parts: Vec<&str> = xml.split("<item").collect();
    if parts.len() <= 1 { return items; }
    parts.remove(0); // Remove header before first <item>

    for part in parts {
        let full_item = format!("<item{}", part);
        let title = extract_between(&full_item, "<title>", "</title>")
            .and_then(|t| extract_between(t, "<![CDATA[", "]]>").or(Some(t)))
            .unwrap_or("");
        
        let link = extract_between(&full_item, "<link>", "</link>")
            .and_then(|l| extract_between(l, "<![CDATA[", "]]>").or(Some(l)))
            .unwrap_or("");

        let desc = extract_between(&full_item, "<description>", "</description>")
            .and_then(|d| extract_between(d, "<![CDATA[", "]]>").or(Some(d)))
            .unwrap_or("");

        if !title.is_empty() && !link.is_empty() {
            items.push(RssItem {
                title: html_decode(title),
                url: link.trim().to_string(),
                description: html_decode(desc),
            });
        }
    }
    items
}

fn extract_between<'a>(s: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let si = s.find(start)?;
    let after = &s[si + start.len()..];
    let ei = after.find(end)?;
    Some(&after[..ei])
}

fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&")
     .replace("&lt;", "<")
     .replace("&gt;", ">")
     .replace("&quot;", "\"")
     .replace("&apos;", "'")
     .replace("&#39;", "'")
}

// ─── Strip HTML tags from description ────────────────────────────────────────

fn strip_html(html: &str) -> String {
    let fragment = Html::parse_fragment(html);
    fragment.root_element().text().collect::<Vec<_>>().join(" ").trim().to_string()
}

// ─── Scout a single source ───────────────────────────────────────────────────

pub async fn scout_source(client: &Client, source: &SourceConfig, db_path: &PathBuf) -> usize {
    let xml = match client
        .get(source.rss_url)
        .header("User-Agent", "MarketSenseVN/1.0 (scout-agent)")
        .send()
        .await
    {
        Ok(r) => match r.text().await {
            Ok(t) => t,
            Err(_) => return 0,
        },
        Err(_) => return 0,
    };

    let items = parse_rss(&xml);
    let mut saved = 0usize;

    for item in items.iter().take(20) { // cap at 20 new per scout per source
        if item.url.is_empty() { continue; }

        let summary = strip_html(&item.description);
        let article = Article {
            id: None,
            title: item.title.clone(),
            url: item.url.clone(),
            source: source.name.to_string(),
            impact: "NEUTRAL".to_string(),
            summary: summary.chars().take(500).collect(),
            entities: "[]".to_string(),
            recommendation: String::new(),
            scraped_at: None,
            // New fields for analyst v2
            content: String::new(),          // fetched lazily by analyst
            analysis_status: "pending".to_string(),
            confidence: None,
            key_price_factors: "[]".to_string(),
            risk_level: None,
            sectors: None,
            tickers: None,
        };

        if insert_article(db_path, &article).is_ok() {
            saved += 1;
        }
    }

    saved
}

// ─── Scout all active sources ─────────────────────────────────────────────────
/// active_sources: list of source names the user has enabled in SourceManager

pub async fn scout_all(db_path: PathBuf, active_sources: Vec<String>) -> usize {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    let mut total = 0usize;

    for source in SOURCES {
        if active_sources.is_empty()
            || active_sources.iter().any(|s| s.eq_ignore_ascii_case(source.name))
        {
            let saved = scout_source(&client, source, &db_path).await;
            total += saved;
            // small delay to be polite to servers
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    }

    total
}
