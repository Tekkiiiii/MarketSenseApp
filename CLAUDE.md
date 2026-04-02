# CLAUDE.md — MarketSenseApp

## Session Startup

1. Read `memory/heartbeat.md` — PD-owned status log
2. Read `PROJECT.md` — project overview and tech stack
3. Read `memory/decisions.md` — key decisions made
4. Sync lessons: diff `~/.claude/memory/lessons/` → `memory/lessons/`
5. Check `src-tauri/tauri.conf.json` for app config

## Project Overview

Vietnamese financial news RSS intelligence app. Watches RSS feeds, filters by user keywords/tickers, uses Ollama (or Claude/Tekki) to generate Bullish/Bearish/Neutral verdicts and Vietnamese summaries. Runs 100% locally.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.8, Vite 7, Tailwind 4
- **Backend:** Rust, Tauri 2, tokio, rusqlite, reqwest, scraper, quick-xml, chrono
- **Packaging:** Tauri bundler, macOS app + Windows NSIS
- **Runtime:** Ollama (local), Claude API, Tekki API, SQLite
- **Location:** `/Users/Tekki/.claude/projects/MarketSenseApp`
- **App ID:** `com.tekki.marketsensevn`

## Build

```bash
npm run tauri build   # full production build
npm run tauri dev     # dev mode with hot reload
```

Build must pass before marking any task complete.

## Memory

- `memory/heartbeat.md` — PD status log (update every session)
- `memory/decisions.md` — key decisions
- `memory/sessions/` — session logs (YYYY-MM-DD.md)
- `memory/lessons/` — lessons synced from root

## Skills

Available skills for this project: `backend`, `frontend`, `superpowers-land-and-deploy`, `superpowers-autoplan`, `pd-status`

## Focus (from PROJECT.md)

| Priority | Item |
|----------|------|
| HIGH | Wire sidebar Scout Now button to real backend (App.tsx) |
| HIGH | AlertFeed: use getLatestAnalyzedArticles + per-article analysis status |
| MEDIUM | 3-column dashboard layout (hot news / list / broker recs) |
| MEDIUM | Verify macOS build passes after changes |

## Three-Agent Architecture

| Agent | Role | File |
|-------|------|------|
| Scout Agent | Polls RSS every N minutes, stores articles in SQLite | `src-tauri/src/scout.rs` |
| Filter Agent | Matches articles against user keywords & tickers | `src-tauri/src/scout.rs` |
| Analyst Agent | Calls Ollama to classify and summarize | `src-tauri/src/analyst.rs` |

## Tailwind Custom Colors

obsidian, charcoal, blaze, blood, crimson — already defined in tailwind.config.js
