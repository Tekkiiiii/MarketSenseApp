# Phase 1 Execute Plan — T04 + T05

## Wave 1 (T04 + T05 are independent — run in parallel)

### Task T04: Ollama Model Pull via Polling

**Problem:** `cmd_pull_ollama_model` pipes stdout/stderr from `ollama pull` — this is broken inside the Tauri sandbox on macOS.

**Solution:** Spawn `ollama pull` as a detached background process, then poll `GET /api/tags` (same endpoint as `cmd_get_ollama_models`) every 5 seconds until the model appears in the list. Emit progress events with status text.

**Files:**
- `src-tauri/src/lib.rs`

**Action:**
1. Read `lib.rs` lines 184–224 (current `cmd_pull_ollama_model`)
2. Replace `cmd_pull_ollama_model` with a new implementation:
   - Spawn `ollama pull <name>` as a detached child (no stdout/stderr piping — just `.spawn()` and drop the handles)
   - Immediately return `Ok(())` so the frontend doesn't hang
   - Start a background async task that:
     - Polls `GET http://localhost:11434/api/tags` every 5 seconds
     - Emits `model-pull-progress` with a status string each poll cycle
     - When the target model appears in the model list, emits `model-pull-done { name, success: true }` and exits
     - If the model doesn't appear after, say, 60 polls (5 minutes), emits `model-pull-done { name, success: false }`
3. Keep the function signature unchanged: `async fn cmd_pull_ollama_model(app: tauri::AppHandle, name: String) -> Result<(), String>`
4. Do NOT use any stdout/stderr piping — that's the root cause

**Verify:** ✅ cargo check passed (2026-03-21) — 2 warnings (pre-existing dead code in db.rs)

---

### Task T05: Windows Compatibility Fixes

**Problem A:** `cmd_check_ollama` uses `which ollama` — `which` doesn't exist on Windows.
**Problem B:** `cmd_get_free_disk_gb` uses `df -k` — `df` doesn't exist on Windows.

**Files:**
- `src-tauri/src/lib.rs` lines 131–180

**Action:**
1. Read `lib.rs` lines 131–180
2. Replace `cmd_check_ollama` with:
   ```rust
   #[cfg(target_os = "windows")]
   async fn find_ollama() -> bool {
       tokio::process::Command::new("where")
           .arg("ollama")
           .output()
           .await
           .map(|o| o.status.success())
           .unwrap_or(false)
   }
   #[cfg(not(target_os = "windows"))]
   async fn find_ollama() -> bool {
       tokio::process::Command::new("which")
           .arg("ollama")
           .output()
           .await
           .map(|o| o.status.success())
           .unwrap_or(false)
   }
   #[tauri::command]
   async fn cmd_check_ollama() -> Result<bool, String> {
       Ok(find_ollama().await)
   }
   ```
3. Replace `cmd_get_free_disk_gb` with platform-specific logic:
   - Windows: use `wmic logicaldisk get FreeSpace,Size /format:value` and parse the FreeSpace value
   - Unix: keep existing `df -k` logic
   - Helper: parse `wmic` output to extract free bytes, then convert to GB

**Verify:** ✅ cargo check passed (2026-03-21) — 2 warnings (pre-existing dead code in db.rs)
