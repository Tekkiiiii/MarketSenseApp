use crate::db::{Article, get_setting, update_article_result, set_article_analysis_analyzing, set_article_analysis_error};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{Emitter, AppHandle};

// ─── Structured result ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub impact: String,               // BULLISH | BEARISH | NEUTRAL
    #[serde(default)]
    pub confidence: i32,              // 0-100
    pub summary: String,              // 5-10 sentences, focused on stock price impact
    #[serde(default)]
    pub key_price_factors: Vec<String>,
    pub recommendation: String,       // specific action + target price
    #[serde(default)]
    pub risk_level: String,          // LOW | MEDIUM | HIGH
    #[serde(default)]
    pub sectors: Vec<String>,
    #[serde(default)]
    pub tickers: Vec<String>,
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

pub fn build_analyst_prompt(article: &Article) -> String {
    let content = if article.content.is_empty() {
        &article.summary
    } else {
        &article.content
    };

    format!(
        r#"SYSTEM: You are a Vietnamese retail investor analyst. Your job is to analyze financial news articles and provide insights that help retail investors make informed decisions about the Vietnamese stock market.

FOCUS: Your primary job is to explain how this news will IMPACT STOCK PRICES. Consider:
- Which specific stock codes (tickers) are affected? (e.g., VNM, HPG, FPT, VCB, VHM, VRE, MSN)
- Will the stock price go UP or DOWN?
- By how much magnitude? (small, medium, large)
- Over what timeframe? (days, weeks, months)
- What are the key price-moving factors?

OUTPUT FORMAT: Return ONLY a valid JSON object, no markdown, no code fences, no explanation.

{{
  "impact": "BULLISH | BEARISH | NEUTRAL",
  "confidence": 0-100,
  "summary": "5-10 sentences in Vietnamese. Focus on: what happened, why it matters for stock prices, what to watch for. Be specific about which stocks are affected and in what direction.",
  "key_price_factors": ["specific factor 1", "specific factor 2", "specific factor 3"],
  "recommendation": "Specific action for retail investors in Vietnamese. Include target price if applicable. Be concrete, not generic.",
  "risk_level": "LOW | MEDIUM | HIGH",
  "sectors": ["sector1", "sector2"],
  "tickers": ["VNM", "HPG", "FPT"]
}}

EXAMPLES:

INPUT: Title: SSI Research nâng giá mục tiêu HPG lên 52,000 VND. Source: CafeF. Content: SSI Research vừa nâng giá mục tiêu cổ phiếu HPG từ 45,000 lên 52,000 VND dựa trên kết quả kinh doanh Q4 vượt kỳ vọng và biên lợi nhuận mở rộng trong phân khúc thép xây dựng. Cổ phiếu HPG tăng 3.2% trong phiên giao dịch hôm nay. Phân tích cho thấy triển vọng ngắn hạn tích cực với mức khuyến nghị tích lũy.

GOOD OUTPUT:
{{
  "impact": "BULLISH",
  "confidence": 85,
  "summary": "SSI Research nâng giá mục tiêu HPG từ 45,000 lên 52,000 VND (+16%) sau kết quả Q4 vượt kỳ vọng nhờ biên lợi nhuận mở rộng. Cổ phiếu HPG tăng 3.2% trong phiên — dấu hiệu tích cực ngắn hạn. Triển vọng trung hạn hỗ trợ bởi nhu cầu thép xây dựng trong nước tăng và giá thép thế giới ổn định. Target 52,000 VND từ SSI tương đương upside ~15% từ mức hiện tại. Lưu ý rủi ro: biến động giá nguyên liệu thép thế giới và chi phí năng lượng.",
  "key_price_factors": ["EPS Q4 vượt kỳ vọng", "Biên lợi nhuận mở rộng phân khúc thép", "Giá thép xây dựng trong nước tăng", "Target 52,000 VND từ SSI (+16%)", "Rủi ro chi phí năng lượng"],
  "recommendation": "Tích lũy HPG quanh 44,000-46,000 VND. Target 52,000 VND theo SSI. Stop loss dưới 40,000 VND. Tỷ trọng khuyến nghị: 5-8% danh mục. Không nên mua đuổi ở mức giá hiện tại — chờ pullback về 44,000 để vào.",
  "risk_level": "MEDIUM",
  "sectors": ["Thép", "Sản xuất"],
  "tickers": ["HPG"]
}}

BAD OUTPUT:
{{
  "impact": "BULLISH",
  "confidence": 70,
  "summary": "SSI Research nâng giá mục tiêu HPG. Cổ phiếu tăng giá.",
  "key_price_factors": ["tăng giá"],
  "recommendation": "Mua HPG",
  "risk_level": "LOW",
  "sectors": ["Thép"],
  "tickers": ["HPG"]
}}

USER:
Title: {title}
Source: {source}
Content: {content}"#,
        title = article.title,
        source = article.source,
        content = content
    )
}

// ─── Parse ───────────────────────────────────────────────────────────────────

fn parse_analysis_result(json_str: &str) -> Option<AnalysisResult> {
    // Strip any markdown code fences
    let cleaned = json_str
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: Value = serde_json::from_str(cleaned).ok()?;
    Some(AnalysisResult {
        impact: v["impact"].as_str().unwrap_or("NEUTRAL").to_uppercase(),
        confidence: v["confidence"].as_i64().unwrap_or(50) as i32,
        summary: v["summary"].as_str().unwrap_or("").to_string(),
        key_price_factors: v["key_price_factors"].as_array()
            .map(|a| a.iter().filter_map(|e| e.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        recommendation: v["recommendation"].as_str().unwrap_or("").to_string(),
        risk_level: v["risk_level"].as_str().unwrap_or("MEDIUM").to_string(),
        sectors: v["sectors"].as_array()
            .map(|a| a.iter().filter_map(|e| e.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        tickers: v["tickers"].as_array()
            .map(|a| a.iter().filter_map(|e| e.as_str().map(String::from)).collect())
            .unwrap_or_default(),
    })
}

// ─── Ollama ──────────────────────────────────────────────────────────────────

async fn call_ollama(article: &Article, model: &str) -> Option<AnalysisResult> {
    let client = Client::new();
    let res = client
        .post("http://localhost:11434/api/chat")
        .json(&json!({
            "model": model,
            "messages": [{ "role": "user", "content": build_analyst_prompt(article) }],
            "stream": false,
            "format": "json"
        }))
        .send()
        .await
        .ok()?;
    let body: Value = res.json().await.ok()?;
    parse_analysis_result(body["message"]["content"].as_str()?)
}

// ─── Claude (own API key) ───────────────────────────────────────────────────

async fn call_claude_api(article: &Article, api_key: &str, model: &str) -> Option<AnalysisResult> {
    let client = Client::new();
    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&json!({
            "model": model,
            "max_tokens": 1024,
            "messages": [{ "role": "user", "content": build_analyst_prompt(article) }]
        }))
        .send()
        .await
        .ok()?;
    let body: Value = res.json().await.ok()?;
    let content = body["content"].as_array()?.first()?.as_object()?["text"].as_str()?;
    parse_analysis_result(content)
}

// ─── Tekki hosted API ───────────────────────────────────────────────────────

async fn call_tekki_api(article: &Article, api_key: &str, endpoint: &str) -> Option<AnalysisResult> {
    let client = Client::new();
    let res = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&json!({
            "title": article.title,
            "content": if article.content.is_empty() { &article.summary } else { &article.content },
            "source": article.source,
        }))
        .send()
        .await
        .ok()?;
    let body: Value = res.json().await.ok()?;
    // Try nested "analysis" field first, then direct body
    serde_json::from_str::<AnalysisResult>(
        body["analysis"].as_str().unwrap_or("{}")
    ).ok()
    .or_else(|| serde_json::from_value(body).ok())
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

pub async fn analyze_article(article: &Article, db_path: &PathBuf) -> Option<AnalysisResult> {
    let backend = get_setting(db_path, "analyzer_backend")
        .ok()
        .flatten()
        .unwrap_or_else(|| "ollama".to_string());

    match backend.as_str() {
        "claude" => {
            let api_key = get_setting(db_path, "user_api_key").ok().flatten()?;
            let model = get_setting(db_path, "user_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string());
            call_claude_api(article, &api_key, &model).await
        }
        "tekki" => {
            let api_key = get_setting(db_path, "tekki_api_key").ok().flatten()?;
            let endpoint = get_setting(db_path, "tekki_api_endpoint")
                .ok()
                .flatten()
                .unwrap_or_else(|| "https://api.tekki.vn/v1/analyze".to_string());
            call_tekki_api(article, &api_key, &endpoint).await
        }
        _ => {
            // ollama (default)
            let model = get_setting(db_path, "ollama_model")
                .ok()
                .flatten()
                .unwrap_or_else(|| "qwen3:4b".to_string());
            call_ollama(article, &model).await
        }
    }
}

// ─── Batch analyzer ──────────────────────────────────────────────────────────

pub async fn analyze_pending(db_path: PathBuf, app: AppHandle) -> usize {
    use crate::db::get_pending_articles;

    let articles = match get_pending_articles(&db_path, 20) {
        Ok(a) => a,
        Err(_) => return 0,
    };

    let mut analyzed_count = 0;
    for article in articles {
        let article_id = match article.id {
            Some(id) => id,
            None => continue,
        };

        // Update status to analyzing
        let _ = set_article_analysis_analyzing(&db_path, article_id);

        // Emit per-article analysis started event
        let _ = app.emit("analysis-started", article_id);

        // Analyze
        if let Some(result) = analyze_article(&article, &db_path).await {
            if update_article_result(
                &db_path,
                article_id,
                &result.impact,
                &result.summary,
                &result.recommendation,
                result.confidence,
                &result.key_price_factors,
                &result.risk_level,
                &result.sectors,
                &result.tickers,
            ).is_ok() {
                analyzed_count += 1;
            }
        } else {
            // Mark as error
            let _ = set_article_analysis_error(&db_path, article_id);
        }

        // Politeness delay
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    if analyzed_count > 0 {
        let _ = app.emit("articles-updated", analyzed_count);
    }

    analyzed_count
}
