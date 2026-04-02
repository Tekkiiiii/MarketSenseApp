# State — MarketSense VN

## Decisions

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D01 | Pluggable analyzer backend (trait `AnalyzerBackend`) | Allows Ollama (free/local), Claude (own key), Tekki (hosted) without duplicating analysis logic | 2026-03-21 | ✅ Done |
| D02 | Fetch full article content before analysis | RSS blurb is 500 chars — not enough for quality analysis. Need full article text (~8000 chars). New fetcher.rs module. | 2026-03-21 | ✅ Done |
| D03 | Keep 3-agent names (Scout/Filter/Analyst) as Rust modules | These are internal services, not separate subagents. No separate projects needed. | 2026-03-21 | ✅ Done |
| D04 | 3-column dashboard layout | Current 55% hot news + strip + table is overloaded. List/detail/sidebar gives better focus. | 2026-03-21 | 🔄 Pending |
| D05 | Default model: qwen3:4b | Best free Ollama model for Vietnamese + financial analysis. Small VRAM, strong Vietnamese, latest release. Alternatives: llama3.2:3b, mistral:7b. | 2026-03-21 | 🔄 Pending |
| D06 | Model pull via polling, not stdout piping | `ollama pull` stdout/stderr piping broken inside Tauri sandbox on macOS. Poll `cmd_get_ollama_models` every 5s instead. | 2026-03-21 | ✅ Done |
| D07 | Prompt focus: stock price impact | Retail investors care about how news affects stock price (up/down, magnitude, timeframe). Summary: 5-10 sentences. Few-shot examples added. | 2026-03-21 | ✅ Done |

## Blockers

| Blocker | Severity | Notes |
|---------|----------|-------|
| Ollama model pull broken (macOS) | HIGH | Tauri subprocess piping issue — workaround via polling |
| Windows compat (cmd_check_ollama, cmd_get_free_disk_gb) | MEDIUM | ✅ Fixed — `where` for Windows, `df -k` for Unix, `wmic` for Windows disk space |
| Tekki API endpoint not defined | LOW | Just stub the URL for now, define later |
| Billing/packaging for Tekki API | LOW | Deferred, don't implement billing logic yet |

## Cross-Session Memory

- **Setup wizard** lives in `src/components/Setup/SetupWizard.tsx` — full refactor needed for model selection + pull progress
- **DB schema** needs columns: `content`, `confidence`, `risk_level`, `sectors`, `analysis_status`
- **Article struct** in `src-tauri/src/db.rs` needs same fields added
- **Tailwind custom colors**: obsidian, charcoal, blaze, blood, crimson (already defined)
- **App ID**: `com.tekki.marketsensevn`

## Next Steps (Next Session)

1. Run Phase 1 tasks (T01-T05) in order
2. Then Phase 2 (T06-T09)
3. Then Phase 3 (T10-T14)
4. Then ship
