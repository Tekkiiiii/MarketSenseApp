use reqwest::Client;
use scraper::Html;

/// Fetches article URL and extracts readable text content.
/// Returns the article body as a plain text string, max ~8000 chars.
pub async fn fetch_article_content(url: &str) -> Option<String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;

    let html = client
        .get(url)
        .header("User-Agent", "MarketSenseVN/1.0 (+https://marketsense.vn)")
        .header("Accept-Language", "vi,en;q=0.9")
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;

    let doc = Html::parse_document(&html);

    // Common selectors for Vietnamese news sites (cafef, vietstock, vneconomy, etc.)
    let selectors = [
        ".content",
        ".article-content",
        ".entry-content",
        ".post-content",
        "#article-body",
        "[itemprop=articleBody]",
        "article",
        ".detail-content",
        ".story-content",
        ".article-body",
        ".article__content",
    ];

    let mut best_text = String::new();
    for sel in &selectors {
        if let Ok(selector) = scraper::Selector::parse(sel) {
            let elements: Vec<_> = doc.select(&selector).collect();
            if !elements.is_empty() {
                let text: String = elements
                    .iter()
                    .flat_map(|e| e.text())
                    .collect::<Vec<_>>()
                    .join(" ")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                if text.len() > best_text.len() {
                    best_text = text;
                }
            }
        }
    }

    // Fallback: grab all paragraph text
    if best_text.len() < 100 {
        if let Ok(p_selector) = scraper::Selector::parse("p") {
            best_text = doc
                .select(&p_selector)
                .flat_map(|e| e.text())
                .collect::<Vec<_>>()
                .join(" ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
        }
    }

    // Truncate to ~8000 chars (~2000 tokens) to stay within model limits
    if best_text.chars().count() > 8000 {
        best_text = best_text.chars().take(8000).collect();
    }

    if best_text.is_empty() {
        None
    } else {
        Some(best_text)
    }
}
