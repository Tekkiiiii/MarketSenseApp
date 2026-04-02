# Roadmap — MarketSense VN

## Milestones

| Milestone | Description | Target |
|-----------|-------------|--------|
| M0 | Alpha — MVP scaffold (scout + ollama, works on macOS) | Done |
| M1 | Core fixes — Windows compat, model pull, prompt rubric, content fetch | Current |
| M2 | Analyzer backends — Ollama + Claude + Tekki pluggable | M1 |
| M3 | Dashboard redesign — 3-column layout, keyboard nav, UX polish | M2 |
| M4 | v1 release — macOS build, stable | TBD |

---

## Phase 1: Core Fixes (M1)

| Task | Description | Owner | Status |
|------|-------------|-------|--------|
| T01 | Article content fetcher (fetcher.rs) | Backend | [x] |
| T02 | Improved analyst prompt + rubric | Backend | [x] |
| T03 | Pluggable analyzer backend (3 options) | Backend | [x] |
| T04 | Ollama model pull fix | Backend+Frontend | [x] |
| T05 | Windows compat (cmd_check_ollama, cmd_get_free_disk_gb) | Backend | [x] |

---

## Phase 2: Analyzer Backends (M2)

| Task | Description | Owner | Status |
|------|-------------|-------|--------|
| T06 | OllamaBackend impl (refactor current) | Backend | [ ] |
| T07 | ClaudeBackend impl (own API key + model) | Backend | [ ] |
| T08 | TekkiBackend impl (Tekki-hosted API) | Backend | [ ] |
| T09 | Analyzer settings UI | Frontend | [ ] |

---

## Phase 3: Dashboard Redesign (M3)

| Task | Description | Owner | Status |
|------|-------------|-------|--------|
| T10 | 3-column layout (AlertFeed + ArticleDetail + WatchlistSidebar) | Frontend | [x] |
| T11 | Broker recommendations panel | Frontend | [x] |
| T12 | Per-article analysis status (spinner + error badge) | Frontend | [x] |
| T13 | Keyboard navigation (j/k, Enter, Esc) | Frontend | [x] |
| T14 | Consistent color system | Frontend | [x] |

---

## Phase 4: Ship (M4)

- [ ] Update PROJECT.md phase → 'v1'
- [ ] Sync to Obsidian vault
- [ ] macOS build: `npm run tauri build`
- [ ] Windows build (after C1+C2)
- [ ] Test on both platforms
