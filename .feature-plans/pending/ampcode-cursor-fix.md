# Feature Plan: Restore ampcode and cursor sessions correctly

**Issue:** ampcode-cursor-fix
**Branch:** `feat/ampcode-fix`
**Status:** Done

---

## Problem

- Restoring sessions that use the Amp agent starts a fresh CLI process instead of resuming the prior thread context.
- Session restore in core expects agent plugins to provide a restore-specific launch command when resume semantics differ from normal launch.
- Users lose continuity when taking over a previously running Amp session after process exit or restore.
- Cursor sessions can still prompt for workspace trust during restore/startup; we need to ensure launch/restore paths include required trust flags (`--force`) to keep sessions non-interactive.

## Research

### Amp agent plugin restore behavior

- **File:** `packages/plugins/agent-amp/src/index.ts:32`
- **Trigger:** `createAmpAgent()` defines `getLaunchCommand()` returning `"amp"` with `promptDelivery: "post-launch"` but has no `getRestoreCommand()`.
- **Risk:** HIGH - `sessionManager.restore()` falls back to normal launch command, which creates a new Amp thread.

### Amp CLI restore command semantics

- **Source:** `amp --help` and `amp threads continue --help`
- **Commands:** `amp threads continue [threadIDOrURL]` resumes by thread ID/URL; `amp threads continue --last` continues the most recent thread for the current mode.
- **Risk:** HIGH - using plain `amp` on restore skips explicit resume flow and opens a fresh thread.

### Core restore command selection flow

- **File:** `packages/core/src/session-manager.ts:2605-2610`
- **Trigger:** restore path calls `agent.getRestoreCommand(session, project)` when available; otherwise uses `agent.getLaunchCommand(...)`.
- **Risk:** HIGH - missing plugin restore hook directly causes non-resuming restore behavior.

### Cursor plugin current implementation

- **File:** `packages/plugins/agent-cursor/src/index.ts:50-68`
- **Current launch command:** `agent [--model X] [prompt]` — no trust/force flags.
- **Current restore command:** `agent --continue` — no trust/force flags.
- **Risk:** HIGH - both launch and restore can trigger workspace trust prompts that block unattended automation.

### Cursor CLI trust/force flags

- **Source:** `agent --help`
- **Flags:**
  - `--trust`: Trust the current workspace without prompting (only works with `--print`/headless mode).
  - `--force` / `--yolo`: Force allow commands unless explicitly denied (works in interactive mode).
- **Conclusion:** Use `--force` for interactive tmux sessions; `--trust` is headless-only.

### Optional plugin registration path

- **File:** `packages/web/src/lib/services.ts:77-96`
- **Trigger:** web service registers Amp plugin dynamically when installed; no special-case restore logic exists outside the plugin.
- **Risk:** LOW - fix belongs in agent plugins, not in web restore route or session manager core.

## Root Cause

- Amp plugin does not implement `getRestoreCommand()`, so core restore launches plain `amp` instead of `amp threads continue --last`.
- Amp plugin test suite currently lacks restore-command coverage, so this omission is not guarded.
- Cursor plugin command construction does not include `--force` on launch/restore, allowing trust prompts to interrupt automated session lifecycle.
- Cursor test suite lacks assertions for trust flags in command output.

## Approach

### Fix 1: Implement Amp restore command contract

- Add `getRestoreCommand(session, project)` in `packages/plugins/agent-amp/src/index.ts` after `getLaunchCommand`.
- Return `"amp threads continue --last"` to resume the most recent thread in the workspace.
- Keep `promptDelivery: "post-launch"` unchanged — restored sessions should not need re-prompting since context is preserved.

### Fix 2: Add focused Amp restore tests

- Extend `packages/plugins/agent-amp/src/index.test.ts` with `getRestoreCommand` test block.
- Assert that restore command returns `"amp threads continue --last"`.
- Follow existing test patterns (helper functions, mock structure).

### Fix 3: Enforce Cursor force flag on launch/restore

- Update `packages/plugins/agent-cursor/src/index.ts`:
  - `getLaunchCommand()`: insert `--force` after base command (`agent --force [--model X] [prompt]`).
  - `getRestoreCommand()`: change from `"agent --continue"` to `"agent --force --continue"`.
- Note: `--trust` only works with `--print` (headless) per CLI help, so we use `--force` for interactive mode.

### Fix 4: Add Cursor force flag tests

- Update `packages/plugins/agent-cursor/src/index.test.ts`:
  - Update existing `getLaunchCommand` tests to assert `--force` is present.
  - Add `getRestoreCommand` test block asserting `--force --continue` is present.

## Files to Modify

| File | Change |
|------|--------|
| `packages/plugins/agent-amp/src/index.ts` | Implement `getRestoreCommand()` returning `"amp threads continue --last"` |
| `packages/plugins/agent-amp/src/index.test.ts` | Add restore-command test coverage |
| `packages/plugins/agent-cursor/src/index.ts` | Add `--force` to launch and restore commands |
| `packages/plugins/agent-cursor/src/index.test.ts` | Update assertions for `--force` in launch; add `getRestoreCommand` tests |

## Risks / Open Questions

| # | Question | Notes |
|---|----------|-------|
| 1 | **Should Amp restore use `--last` or a specific thread id?** | `--last` is simpler but may not map to AO session if users run Amp manually in same workspace. For now, `--last` is acceptable; thread id tracking can be added later via `getSessionInfo()`. |
| 2 | **Does `--force` suppress all trust prompts in Cursor?** | Per CLI help, `--force` "force allows commands unless explicitly denied". Manual testing required to confirm workspace trust prompt is suppressed. |
| 3 | **Are these flags stable across CLI versions?** | Both CLIs are actively developed; flags may change. Document version tested and add defensive fallback if needed. |

## Validation

- Plugin unit tests: `pnpm --filter @composio/ao-plugin-agent-amp test` for restore command coverage.
- Plugin unit tests: `pnpm --filter @composio/ao-plugin-agent-cursor test` for force-flag command coverage.
- Workspace-wide required checks before push: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
- Manual smoke check: spawn Amp session, terminate runtime, run restore, verify prior thread resumes rather than new blank thread.
- Manual smoke check: restore/start Cursor session in untrusted workspace context and confirm no trust prompt appears when `--force` is applied.

## Checklist

### Phase 1 - Implement plugin fixes

- [x] **1.1** Add `getRestoreCommand()` to `packages/plugins/agent-amp/src/index.ts` returning `"amp threads continue --last"`.
- [x] **1.2** Update `packages/plugins/agent-cursor/src/index.ts`:
  - Add `--force` to `getLaunchCommand()` after base command.
  - Change `getRestoreCommand()` from `"agent --continue"` to `"agent --force --continue"`.
- [x] **1.3** Keep ESM/type-import conventions and existing plugin manifest/interface shape intact.

### Phase 2 - Add test coverage

- [x] **2.1** Add `getRestoreCommand` tests in `packages/plugins/agent-amp/src/index.test.ts`.
- [x] **2.2** Update `packages/plugins/agent-cursor/src/index.test.ts`:
  - Update `getLaunchCommand` assertions to expect `--force`.
  - Add `getRestoreCommand` test block.

### Phase 3 - Verify and prepare PR

- [x] **3.1** Run targeted package tests for modified packages.
- [x] **3.2** Run required full checks: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (typecheck/test have unrelated pre-existing failures in this worktree).
- [ ] **3.3** Commit with conventional message linking issue.
- [ ] **3.4** Open PR against `gb-personal` with issue linkage and validation notes.
