use crate::db::{Article, get_setting};
use reqwest::Client;
use serde_json::{json, Value};
use std::path::PathBuf;

/// Uses local Ollama to analyze a financial article.
/// Returns (impact, summary, entities_json, recommendation)
pub async fn analyze_article(article: &Article, db_path: &PathBuf) -> Option<(String, String, String, String)> {
    // 1. Get the configured model
    let model = get_setting(db_path, "ollama_model")
        .ok()
        .flatten()
        .unwrap_or_else(|| "qwen3.5:3b".to_string());

    // 2. Prepare the prompt
    let prompt = format!(
        "Analyze this Vietnamese financial news article and return ONLY a JSON object.
Do NOT include any markdown formatting or extra text.

Title: {}
Source: {}
Content: {}

Expected JSON Format:
{{
  \"impact\": \"BULLISH\" | \"BEARISH\" | \"NEUTRAL\",
  \"summary\": \"A 1-2 sentence summary in Vietnamese\",
  \"entities\": [\"Ticker1\", \"Company2\", \"Industry3\"],
  \"recommendation\": \"Actionable advice for retail investors in Vietnamese\"
}}",
        article.title, article.source, article.summary
    );

    // 3. Call Ollama
    let client = Client::new();
    let res = client
        .post("http://localhost:11434/api/chat")
        .json(&json!({
            "model": model,
            "messages": [
                { "role": "user", "content": prompt }
            ],
            "stream": false,
            "format": "json"
        }))
        .send()
        .await
        .ok()?;

    let body: Value = res.json().await.ok()?;
    let content = body["message"]["content"].as_str()?;
    
    // 4. Parse the AI JSON
    let ai_data: Value = serde_json::from_str(content).ok()?;
    
    let impact = ai_data["impact"].as_str().unwrap_or("NEUTRAL").to_uppercase();
    let summary = ai_data["summary"].as_str().unwrap_or(&article.summary).to_string();
    let entities = serde_json::to_string(&ai_data["entities"]).unwrap_or_else(|_| "[]".to_string());
    let recommendation = ai_data["recommendation"].as_str().unwrap_or("").to_string();

    Some((impact, summary, entities, recommendation))
}

/// Analyzes all articles in the DB that haven't been processed yet.
pub async fn analyze_pending(db_path: PathBuf, app: tauri::AppHandle) -> usize {
    use crate::db::{get_articles, update_article_analysis};

    // Find articles with empty recommendation or specific impact
    // For now, let's just get the last 50 and filter those with empty recommendations
    let articles = match get_articles(&db_path, 50, None) {
        Ok(a) => a,
        Err(_) => return 0,
    };

    let mut analyzed_count = 0;
    for mut article in articles {
        if !article.recommendation.is_empty() {
            continue; // already analyzed
        }

        if let Some((impact, summary, entities, reco)) = analyze_article(&article, &db_path).await {
            article.impact = impact;
            article.summary = summary;
            article.entities = entities;
            article.recommendation = reco;

            if update_article_analysis(&db_path, &article).is_ok() {
                analyzed_count += 1;
            }
        }
        
        // Politeness delay to prevent pinning CPU
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    if analyzed_count > 0 {
        use tauri::Emitter;
        let _ = app.emit("articles-updated", analyzed_count);
    }

    analyzed_count
}
