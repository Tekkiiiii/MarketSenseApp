# Windows Lessons

## Bugs

- [2026-03-21] `which` fails on Windows — use `where` or `Get-Command` (PowerShell)
- [2026-03-21] `df -k` fails on Windows — use `wmic logicaldisk get size,freespace` or `Get-PSDrive`
- [2026-03-21] Shell commands using Unix paths (`/`, `$PATH`) fail on Windows cmd/powershell

## Patterns

- Always use platform-agnostic commands or detect OS before running shell commands
- Wrap platform-specific tools behind abstraction functions
- Test on both macOS and Windows before shipping

## Anti-patterns

- Never use `which` in cross-platform code
- Never use Unix-only tools (`df`, `ps`, `grep` on macOS paths) in cross-platform code
