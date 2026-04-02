# Architectural Decisions — MarketSenseApp

## Three-Agent Architecture
| Agent | Role | File |
|-------|------|------|
| Scout Agent | Polls RSS every N minutes, stores articles | `scout.rs` |
| Filter Agent | Matches articles against keywords & tickers | `scout.rs` |
| Analyst Agent | Calls Ollama to classify and summarize | `analyst.rs` |

## Database
- SQLite via rusqlite
- `articles` table: id, title, url, source, impact, summary, entities, recommendation, scraped_at
- `app_settings` table: key/value store

## AI Backend
- Three backends supported: Ollama (local), Claude API, Tekki API
- Backend selection persisted in `analyzer_backend` setting
- API keys stored in `user_api_key`, `tekki_api_key`, `tekki_api_endpoint`
- Ollama default model: `qwen2.5:3b`

## Windows Compatibility
- `cmd_check_ollama` uses platform-specific detection (`which` / `where`)
- `cmd_get_free_disk_gb` uses platform-specific detection (`df` / `wmic`)

## Deployment
- Native Tauri app (macOS + Windows) — NOT web deployable
