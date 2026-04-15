# Catchup: Merge Upstream Main → gb-personal (April 2026)

## Goal
- Bring gb-personal up to date with ~137 upstream commits from ComposioHQ/agent-orchestrator main
- Preserve all gb-personal UI customizations

## Strategy
- Merge (not rebase/cherry-pick): 385 commits × 245+ conflicting files makes rebase infeasible
- Conflict policy: web UI components → `--ours`; core/CLI engine → `--theirs`; manual for types + opencode

## PR
- fastestdevalive/agent-orchestrator#40 (gb-personal → main)

---

## Files Changed in Merge Commit

Files are grouped by conflict resolution strategy. Check the **manually merged** section — those are the highest risk for lost customizations.

### Manually Merged (verify customizations)

| File | What was preserved from gb-personal |
|------|--------------------------------------|
| `packages/core/src/types.ts` | SubSession/RestoreOptions interfaces; isKilledSession; SessionAttentionLevel; GlobalPauseState re-export |
| `packages/core/src/index.ts` | Removed listSubSessionIds, _resetOpenCodeSessionListCache, global-pause exports (no longer in core) |
| `packages/web/src/lib/types.ts` | DashboardSession.userPrompt optional; isKilledSession; SessionAttentionLevel; GlobalPauseState |
| `packages/web/src/lib/format.ts` | stripBranchHashPrefix, isNumericIssueLabel, getSessionSidebarLabel preserved |
| `packages/web/src/lib/global-pause.ts` | Self-contained web-local copy (upstream reverted from core; gb-personal still uses it) |
| `packages/plugins/agent-opencode/src/index.ts` | gb-personal session list cache (TTL 10s) + main's `captured` variable pattern |
| `packages/core/src/__tests__/metadata.test.ts` | Removed listSubSessionIds import/test |
| `packages/core/src/__tests__/prompt-builder.test.ts` | Updated to match main's BASE_AGENT_PROMPT sections |

### Took `--ours` (gb-personal, UI customizations preserved)

- `packages/web/src/components/ActivityDot.tsx`
- `packages/web/src/components/ConnectionBar.tsx`
- `packages/web/src/components/DynamicFavicon.tsx` ← added sseAttentionLevels prop
- `packages/web/src/components/PRStatus.tsx` ← added muted prop
- `packages/web/src/components/ProjectSidebar.tsx` ← added mobileOpen/onMobileClose props
- `packages/web/src/components/PullRequestsPage.tsx` ← fixed useSessionEvents call (null 2nd arg)
- `packages/web/src/components/SessionDetail.tsx`
- `packages/web/src/components/Terminal.tsx`
- `packages/web/src/components/ThemeToggle.tsx`
- `packages/web/src/app/(with-sidebar)/sessions/[id]/page.tsx`
- `packages/web/src/app/layout.tsx`
- `packages/web/src/app/icon.tsx`
- `packages/web/src/lib/serialize.ts`
- `packages/web/src/lib/services.ts`
- `packages/web/src/lib/orchestrator-utils.ts`
- `packages/web/src/lib/project-utils.ts`
- `packages/web/src/lib/validation.ts` ← removed duplicate validateConfiguredProject

### Took `--theirs` (upstream, engine improvements)

- `packages/core/src/config.ts`
- `packages/core/src/lifecycle-manager.ts`
- `packages/core/src/metadata.ts`
- `packages/core/src/plugin-registry.ts`
- `packages/core/src/prompt-builder.ts`
- `packages/core/src/session-manager.ts`
- `packages/core/src/utils.ts`
- `packages/core/src/notifier-resolution.ts`
- `packages/cli/src/commands/spawn.ts`
- `packages/cli/src/commands/start.ts`
- `packages/cli/src/commands/session.ts`
- `packages/cli/src/commands/update.ts`
- `packages/cli/src/lib/lifecycle-service.ts`
- `packages/cli/src/lib/plugins.ts`
- `packages/cli/src/lib/update-check.ts`
- `packages/cli/src/lib/prevent-sleep.ts`
- `packages/cli/src/program.ts`
- `packages/plugins/agent-aider/src/index.ts`
- `packages/plugins/agent-aider/src/index.test.ts`
- `packages/plugins/agent-codex/src/index.ts`
- `packages/plugins/agent-codex/src/index.test.ts`
- `packages/plugins/agent-cursor/src/index.ts`
- `packages/plugins/agent-cursor/src/index.test.ts`
- `packages/plugins/agent-claude-code/src/index.ts`
- `packages/plugins/runtime-tmux/src/index.ts`
- `packages/plugins/scm-github/src/index.ts`
- `packages/plugins/tracker-linear/src/index.ts`

### Removed (no longer exist)

- `packages/core/src/global-pause.ts` — reverted upstream; web-local copy created
- `packages/core/src/decomposer.ts` — removed upstream
- `packages/cli/src/commands/lifecycle-worker.ts` — removed upstream
- `packages/web/src/app/api/sessions/[id]/sub-sessions/` (entire dir) — sub-session methods removed from session-manager
- `packages/web/src/app/sessions/` (top-level dir) — gb-personal uses (with-sidebar) routing

### Added from upstream (new files)

- `packages/web/src/app/prs/page.tsx`
- `packages/web/src/app/manifest.ts`
- `packages/web/src/app/apple-icon.tsx`
- `packages/web/src/app/icon-192/route.tsx`
- `packages/web/src/app/icon-512/route.tsx`
- `packages/web/src/app/api/runtime/terminal/route.ts`
- `packages/web/src/components/ServiceWorkerRegistrar.tsx`
- `packages/web/src/lib/icon-renderer.tsx`
- `packages/web/public/offline.html`
- `packages/cli/src/lib/update-check.ts`
- `packages/cli/src/lib/prevent-sleep.ts`
- `packages/core/src/notifier-resolution.ts`
- `.github/scripts/coverage-report.mjs`
- `tsconfig.node.json`

### Package.json changes

- `packages/web/package.json` — added @xterm/xterm ^6.0.0, mermaid, react-markdown, rehype-highlight, remark-gfm, highlight.js (gb-personal deps)
- All plugin `package.json` files — upstream version bumps (took `--theirs`)
- `packages/plugins/agent-amp/package.json` — @composio/ao-core ref kept (core still uses @composio/ scope in this fork)

---

## Key Customizations to Verify After Merge

- [ ] DashboardGB renders (not upstream Dashboard)
- [ ] DirectTerminalGB renders in session detail
- [ ] SessionCardGB renders in kanban
- [ ] File tree panel visible and functional
- [ ] Markdown/mermaid preview works in session detail
- [ ] Cursor agent appears in new-session form
- [ ] Amp agent appears in new-session form
- [ ] MuxProvider wrapping works (multi-terminal)
- [ ] Mobile sidebar (mobileOpen/onMobileClose props on ProjectSidebar)
- [ ] Global pause UI still works (uses web-local global-pause.ts)
- [ ] xterm v6 terminal renders without errors
