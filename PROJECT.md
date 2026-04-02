---
name: MarketSense VN
status: active
phase: v1
version: 0.2.0
last_session: 2026-04-02

tech_stack:
  frontend: [React 19, TypeScript 5.8, Vite 7, Tailwind 4, node-pty]
  backend: [Rust, Tauri 2, tokio, rusqlite, reqwest, scraper, quick-xml, chrono]
  packaging: [Tauri bundler, macOS app, Windows NSIS]
  runtime: [Ollama, Claude API, Tekki API, SQLite]

build: passing

blockers: []

focus:
  - Wire sidebar Scout Now button to real backend (App.tsx)
  - AlertFeed: use getLatestAnalyzedArticles + per-article analysis status
  - 3-column dashboard layout (hot news / list / broker recs)
  - Verify macOS build passes after changes
---

## What This Project Is

MarketSense VN watches Vietnamese financial news via RSS feeds, filters by user keywords/tickers, and uses a local Ollama model to generate market impact verdicts (Bullish/Bearish/Neutral), Vietnamese summaries, and retail investor recommendations. Runs 100% locally.

## Current Status

MVP complete. RSS scouting and Ollama analysis working. Three AI backends supported (Ollama/Claude/Tekki). macOS build passes. Remaining: sidebar wire-up, AlertFeed analysis status, 3-column layout.

## Three-Agent Architecture

| Agent | Role | File |
|-------|------|------|
| Scout Agent | Polls RSS every N minutes, stores articles in SQLite | `src-tauri/src/scout.rs` |
| Filter Agent | Matches articles against user keywords & tickers | `src-tauri/src/scout.rs` |
| Analyst Agent | Calls Ollama to classify and summarize | `src-tauri/src/analyst.rs` |

## Key Architecture

- `src-tauri/src/` — Rust backend: Tauri commands, scout loop, SQLite CRUD, Ollama client
  - `lib.rs` — command handlers + background scout loop
  - `db.rs` — SQLite init, CRUD, settings read/write
  - `scout.rs` — RSS fetcher + HTML parser
  - `analyst.rs` — Ollama API caller
- `src/` — React frontend: channel list, message thread UI, settings
- `src-tauri/tauri.conf.json` — app config, bundle ID, window (1280x800, min 900x600)
- `public/guide-en.html` + `public/guide-vi.html` — Ollama setup guides

## Database Schema

- `articles` — id, title, url, source, impact, summary, entities, recommendation, scraped_at
- `app_settings` — key TEXT PRIMARY KEY, value TEXT

## Open Questions

- Persistence strategy for conversation history per RSS source?
- Should Scout Agent support polling sources not in the hardcoded SOURCES list?
