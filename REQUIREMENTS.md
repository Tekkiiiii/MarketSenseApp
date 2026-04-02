# Requirements — MarketSense VN v1

## Status Legend
- [ ] Not started
- [x] Done
- 🔄 In progress

---

## A — Analyzer & AI

### A1: Article Content Fetcher 🔄
Fetch full article HTML from URL before analysis, not just RSS blurb.
- Use `scraper` crate to extract readable text from article page
- Truncate to ~3000 words for token budget
- Store in `Article.content` field
- **Owner**: Backend
- **Status**: [ ]

### A2: Improved Analyst Prompt + Rubric 🔄
Structured prompt with explicit rubric, focusing on stock price impact.
- System prompt: "You are a Vietnamese retail investor analyst..."
- Output JSON fields:
  - `impact`: BULLISH | BEARISH | NEUTRAL
  - `confidence`: 0-100
  - `key_price_factors`: string[] of specific price-moving factors
  - `summary`: 5-10 sentences, focusing on stock price impact (up/down, magnitude, timeframe)
  - `recommendation`: specific action + target price if applicable
  - `risk_level`: LOW | MEDIUM | HIGH
  - `affected_sectors`: string[]
  - `affected_tickers`: string[] (exact stock codes like VNM, HPG, FPT)
- Few-shot examples in prompt showing good vs bad output
- DB schema: add `confidence`, `risk_level`, `sectors`, `content` columns
- **Owner**: Backend
- **Status**: [ ]

### A3: Pluggable Analyzer Backend (3 options) 🔄
Trait `AnalyzerBackend` with 3 implementations:
- `OllamaBackend` — free, local, current implementation
- `ClaudeBackend` — user provides own API key + model name
- `TekkiBackend` — Tekki-hosted API (free tier → paid later)
- Settings: `analyzer_backend` ('ollama' | 'claude' | 'tekki'), `tekki_api_key`, `user_api_key`, `user_model`
- If keys not configured, options disabled in Settings UI
- **Owner**: Backend
- **Status**: [ ]

### A4: Per-Article Analysis Status 🔄
- Article has `analysis_status: 'pending' | 'analyzing' | 'done' | 'error'`
- Show spinner on cards being analyzed
- Emit `analysis-updated` event from Rust after each article
- Show error badge if analysis fails
- **Owner**: Frontend + Backend
- **Status**: [ ]

### A5: Model Pull Fix 🔄
Setup wizard and Settings model pull currently broken.
- Poll `cmd_get_ollama_models` every 5s instead of piping stdout
- Emit `model-pull-progress` + `model-pull-done` events
- Setup Wizard: model selector (qwen3:4b default, llama3.2:3b, mistral:7b alternatives)
- **Owner**: Backend + Frontend
- **Status**: [ ]

---

## B — Dashboard UI

### B1: Dashboard Redesign 🔄
3-column layout replacing current single-panel approach.
- Left (30%): article list — impact badges, time, unread dots, compact cards
- Center (50%): article detail — title, source, time, AI verdict, key factors, reasoning, recommendation, risk level
- Right (20%): watchlist tickers + broker recommendations
- Broker recs: dedicated panel with broker name + rating chip + target price
- **Owner**: Frontend
- **Status**: [ ]

### B2: Keyboard Navigation 🔄
- j/k to navigate article list
- Enter to open detail
- Esc to collapse/close
- Focus rings on all interactive elements
- **Owner**: Frontend
- **Status**: [ ]

### B3: Consistent Color System 🔄
- Impact: BULLISH → emerald, BEARISH → rose/red, NEUTRAL → zinc
- Risk: LOW → emerald, MEDIUM → amber, HIGH → rose
- Theme-aware (dark/light)
- **Owner**: Frontend
- **Status**: [ ]

---

## C — Compatibility

### C1: Windows `cmd_check_ollama` Fix 🔄
- Detect `cfg!(target_os = "windows")` → use `where` else `which`
- **Owner**: Backend
- **Status**: [ ]

### C2: Windows `cmd_get_free_disk_gb` Fix 🔄
- Detect Windows → parse `wmic logicaldisk get FreeSpace,Size /format:list`
- **Owner**: Backend
- **Status**: [ ]
