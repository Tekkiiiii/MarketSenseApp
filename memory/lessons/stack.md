# Stack Lessons — MarketSenseApp

## Subagent Lessons

### Frontend subagent stalls after partial progress (2026-04-02)
**Root cause**: Subagent completed git diff work (1,354 lines) but didn't run build verification or iterate. Likely got blocked on the `cmd_retry_analysis` permission request, then stopped.

**Fix**: For M3/M4-size frontend tasks:
- Brief subagent to run `npm run tauri build` as the FINAL step — don't give them a choice
- Give them a hard deliverable: "commit + build passes" not just "make changes"
- Permission requests mid-stream freeze subagent progress — prefer direct implementation for Rust edits

**Never again**: Brief frontend subagents with "verify build passes before reporting done."

## TypeScript Lessons

### Sort comparator must return consistent type (2026-04-02)
**Bug**: AlertFeed.tsx had a sort comparator mixing `localeCompare` (returns number), `impactOrder` subtraction (returns number), and a conditional with `tb - ta` (returns number). In the new version this was likely broken.

**Fix**: Always write sort comparator as:
```ts
items.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortKey === 'source') cmp = a.source.localeCompare(b.source);
    else if (sortKey === 'impact') cmp = impactOrder[a.impact] - impactOrder[b.impact];
    else {
        const ta = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
        const tb = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
        cmp = ta - tb;
    }
    return sortDir === 'desc' ? -cmp : cmp;
});
```
Always end with `return sortDir === 'desc' ? -cmp : cmp` — never inline the direction.

## Session Lessons

### Always verify build before marking task complete (2026-04-02)
**Root cause**: Multiple tasks were marked `[x]` in ROADMAP.md without running build verification.

**Fix**: Build verification is part of every task. Build must pass before marking any task done.
