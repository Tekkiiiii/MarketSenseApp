# Vercel Lessons

## Bugs

- [2026-03-22] Build commands cached server-side after `vercel link` — local `vercel.json` changes CANNOT override cached settings. Fix: use `vercel project inspect <name>` to check cached settings. Clear via Vercel dashboard or re-import project.
- [2026-03-22] rootDirectory NOT supported in Vercel config for monorepos — Next.js in `web/` workspace: deploy from `web/` subdirectory directly.
- [2026-03-22] Root `tsconfig.json` with `NodeNext` module resolution interferes with workspace tsconfig in Next.js — Next.js traverses upward and finds root tsconfig first. Fix: remove path aliases from root tsconfig.

## Patterns

- Use `vercel project inspect <name>` to verify cached build/install commands before deploying
- Deploy monorepo subdirectories by setting the project root in Vercel dashboard, not in vercel.json
- `vercel --prod --no-cache` bypasses cache but does NOT clear cached project settings

## Anti-patterns

- Never assume local vercel.json overrides server-side cached settings
- Never put `rootDirectory` in vercel.json for monorepos
