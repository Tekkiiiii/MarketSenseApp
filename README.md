# MarketSense VN 📊

> AI-powered Vietnamese stock market intelligence — runs 100% locally on your machine.

**Tech stack:** Tauri 2 · Rust · React 18 · TypeScript · Vite · SQLite · Tailwind CSS · Ollama

---

## What It Does

MarketSense VN is a desktop app (Mac & Windows) that watches Vietnamese financial news sources, filters them by your keywords/tickers, and uses a local AI model (via Ollama) to generate:
- **Market Impact**: Bullish / Bearish / Neutral verdict
- **Vietnamese Summary**: 1-2 sentence digest
- **Stock Tickers**: Entities mentioned
- **Retail Investor Recommendation**: Actionable advice in Vietnamese

### Three-Agent Architecture

| Agent | Role |
|---|---|
| 🔭 **Scout Agent** | Polls RSS feeds every N minutes, stores new articles in SQLite |
| 🔍 **Filter Agent** | Matches articles against user keywords & tickers |
| 🤖 **Analyst Agent** | Calls local Ollama to classify and summarize each article |

---

## Project Structure

```
MarketSenseApp/
├── src/                        # React (TypeScript) frontend
│   ├── App.tsx                 # Root — AppContext, routing between views
│   ├── lib/
│   │   └── db.ts               # Tauri `invoke()` bridge for ALL backend commands
│   └── components/
│       ├── Dashboard/
│       │   └── AlertFeed.tsx   # Main news view + AI impact colour + Broker Recommendations strip
│       ├── Setup/
│       │   └── SetupWizard.tsx # 4-step wizard + Ollama install check on finish
│       └── Settings/
│           ├── ScoutSettings.tsx   # Appearance/lang/scout freq/AI model/DB pruning
│           ├── SourceManager.tsx   # Enable / disable RSS sources (persisted to DB)
│           └── KeywordManager.tsx  # Keywords & tickers (persisted to DB)
├── src-tauri/src/              # Rust backend (Tauri)
│   ├── lib.rs                  # All Tauri command handlers + background scout loop
│   ├── db.rs                   # SQLite init, CRUD, settings read/write
│   ├── scout.rs                # RSS fetcher + HTML parser
│   └── analyst.rs              # Ollama API caller (analyze_article, analyze_pending)
└── public/
    ├── guide-en.html           # Ollama setup guide (English) — opened by SetupWizard
    └── guide-vi.html           # Ollama setup guide (Vietnamese)
```

---

## Database Schema

```sql
articles (
  id, title, url, source, impact, summary, entities, recommendation, scraped_at
)
app_settings (key TEXT PRIMARY KEY, value TEXT)
```

Key settings stored:
| Key | Default | Notes |
|---|---|---|
| `prune_interval` | `never` | `daily / weekly / monthly / quarterly / yearly / never` |
| `scout_frequency_mins` | `15` | `0` = manual only |
| `ollama_model` | `qwen3.5:3b` | Any installed Ollama model name |
| `ui_lang` | `vi` | `en` or `vi` |
| `setup_complete` | _(unset)_ | `1` once wizard is done |
| `active_sources` | all | JSON array of source names |
| `keywords` | _(default list)_ | JSON string array |
| `tickers` | _(default list)_ | JSON string array |

---

## Tauri Commands (Backend)

All commands are registered in `lib.rs` and called from `src/lib/db.ts`.

### DB Commands
- `cmd_insert_article`, `cmd_get_articles(limit, search?)`, `cmd_count_articles`, `cmd_prune_articles`
- `cmd_get_settings`, `cmd_get_setting(key)`, `cmd_set_setting(key, value)`

### Scout Commands
- `cmd_scout_now(active_sources[])` → fetches RSS, saves new articles, then fires `analyze_pending`
- `cmd_scout_status` → `bool` (currently scouting?)
- `cmd_analyze_now` → runs `analyze_pending` on articles where `recommendation` is empty

### Ollama Commands
- `cmd_check_ollama` → `bool` (is `ollama` binary in PATH?)
- `cmd_get_ollama_models` → `string[]` from `http://localhost:11434/api/tags`
- `cmd_get_free_disk_gb` → `f64` available GB
- `cmd_pull_ollama_model(name)` → spawns `ollama pull`, streams `model-pull-progress` events, emits `model-pull-done { name, success }`

### Tauri Events (backend → frontend)
- `articles-updated` — emitted after scout or analysis completes
- `model-pull-progress` — streamed lines during `ollama pull`
- `model-pull-done` — `{ name: string, success: boolean }`

---

## RSS Sources

Defined as `SOURCES` const in `scout.rs`:
- CafeF · Vietstock · VnEconomy · VNExpress Kinh Doanh · Báo Đầu Tư · Tin Nhanh Chứng Khoán

---

## Default Keywords

Stored in `KeywordManager.tsx` and persisted to `app_settings`:
- khuyến nghị · mua · bán · tăng · giảm · lợi nhuận · doanh thu · cổ tức · phá sản · sáp nhập · khuyến nghị của các công ty chứng khoán

---

## UI Layout

```
App
 ├── SetupWizard (shown until setup_complete = 1)
 └── Main App
      ├── Header (Scout status pulse, manual scout button, language toggle)  
      ├── Sidebar tabs: Dashboard | Keywords | Sources | Settings
      └── Content
           ├── Dashboard → AlertFeed.tsx
           │    ├── Impact ticker strip (Bullish / Bearish cards)
           │    ├── Broker Recommendations strip (amber cards, keyword-filtered)
           │    ├── Recommended by AI cards
           │    └── All News table
           ├── Keywords → KeywordManager.tsx
           ├── Sources  → SourceManager.tsx
           └── Settings → ScoutSettings.tsx
```

---

## Design System (Tailwind)

Custom colours defined in `tailwind.config.js`:
- `obsidian` — page background `#0a0a0a`
- `charcoal` — card background `#111`
- `blaze` — primary orange `#f97316`
- `blood` — secondary red `#e11d48`

---

## Dev Setup

### Prerequisites
- Node.js 20+
- Rust + Cargo (via [rustup](https://rustup.rs))
- Tauri CLI: `npm install -g @tauri-apps/cli`
- [Ollama](https://ollama.com) with a model pulled, e.g.: `ollama pull qwen3.5:3b`

### Run (Dev)
```bash
npm install
npm run tauri dev
```

### Build (Production)
```bash
npm run tauri build
```
Output: `src-tauri/target/release/bundle/` (`.dmg` on Mac, `.msi`/`.exe` on Windows)

---

## Windows Notes

- All Rust code is cross-platform. No platform-specific APIs used.
- `cmd_check_ollama` uses `which` — on Windows this should be `where`. **TODO: fix for Windows.**
- `cmd_get_free_disk_gb` uses `df -k` — on Windows use `wmic logicaldisk`. **TODO: fix for Windows.**
- The Tauri bundle for Windows produces an NSIS installer (`.exe`) or `.msi`.
- Make sure Ollama for Windows is installed and its path is in `%PATH%`.

---

## Known TODOs / Next Steps

- [ ] Fix `cmd_check_ollama` and `cmd_get_free_disk_gb` for Windows (use `where` / `wmic`)
- [ ] Add Setup Wizard step to select a model and actually pull it during setup (not just post-finish)
- [ ] Show analysis status indicator per-article in the Dashboard (e.g. a spinner on cards still being analyzed)
- [ ] Add OpenAI / Gemini cloud API fallback for Analyst Agent
- [ ] Stream pull progress into the SetupWizard (currently only in Settings)
