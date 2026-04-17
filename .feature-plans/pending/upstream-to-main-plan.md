# Feature Plan: Upstream gb-personal → ComposioHQ/agent-orchestrator main

**Issue:** upstream-correctly-to-main
**Branch:** `feat/upstream-correctly-to-main`
**Status:** WIP

---

## Context & Strategy

- gb-personal is ~393 commits ahead of upstream `main`
- Upstream in 8 focused PRs, each one feature area, latest gb-personal code as source
- Integrate into upstream components in-place (no parallel "GB variants")
- See `subsession-concept.md` (sibling file) for the conceptual model used by PR7

**GB variant components that must be merged into their upstream counterparts and deleted:**
- `DashboardGB.tsx` → merged into `Dashboard.tsx`
- `SessionCardGB.tsx` → merged into `SessionCard.tsx`
- `DirectTerminalGB.tsx` → merged into `DirectTerminal.tsx`

**How the implementing agent gets source code:**
- Branch off upstream `main` (ComposioHQ/agent-orchestrator)
- Source files live on `feat/upstream-correctly-to-main` in fastestdevalive/agent-orchestrator
- Extract each file with: `git show feat/upstream-correctly-to-main:packages/web/src/components/Foo.tsx`
- Or diff a file: `git diff main..feat/upstream-correctly-to-main -- packages/web/src/components/Foo.tsx`
- Change ALL `@aoagents/ao-core` imports → `@composio/ao-core` before committing

**Before every PR push:** `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test`
- `pnpm install` regenerates `pnpm-lock.yaml` whenever deps change (PR1, PR6a, PR6b)

**Upstream layout structure (IMPORTANT):**
- Upstream has NO `(with-sidebar)` route group. All layout changes go to `packages/web/src/app/layout.tsx`
- Pages live at `app/page.tsx`, `app/sessions/[id]/page.tsx` — no nested route groups
- Do NOT create or reference `app/(with-sidebar)/` paths in any PR
- Sidebar + topbar are rendered **inside** `Dashboard.tsx` and `SessionDetail.tsx` (not in `layout.tsx`)
- Each "page-shell" component owns its own `<header className="dashboard-app-header">` + `<div className="dashboard-shell">` + `<ProjectSidebar>` wrapper
- See `feat/upstream-pr2-pr3` branch for the canonical post-PR2/PR3 layout

**Branch already merged (must not be re-included in any new PR):**
- `feat/upstream-pr2-pr3` — already covers PR2 + PR3 (terminal layout, topbar, sidebar, hamburger, ReconnectingPill, SidebarContext, ProjectSidebar mobile overlay, dashboard-app-shell CSS)
- All later PRs should **diff against PR2/PR3 head**, not raw upstream `main`, when reasoning about layout

**Upstream package names:**
- Core package is `@aoagents/ao-core` on upstream (NOT `@composio/ao-core`) — do not rename existing imports
- xterm package is `xterm` (NOT `@xterm/xterm`) — use `import type { Terminal } from "xterm"` in new files

**Cross-cutting constraints:**
- C-01: No new UI component libraries (no Radix, shadcn, etc.)
- C-02: No inline `style=` attributes — Tailwind only
- C-04: Component files max 400 lines — split if needed
- C-05: Dark theme preserved
- C-12: Test files for all new components
- Security: all file-reading routes validate path is within worktree (see PR6a)
- Mermaid: always dynamic import with `ssr: false`
- Verify `pnpm-workspace.yaml` glob before adding new packages (it likely uses `packages/plugins/*`)
- Verify whether a `__tests__/DirectTerminal.test.tsx` already exists on upstream before creating it

---

## PR 1 — Amp Agent Plugin

**Branch:** `feat/upstream-agent-amp`
**Upstream base:** `main`
**No dependencies on other PRs**

### Context

Upstream `main` already has `agent-cursor` (it was in upstream before our catchup).
`agent-amp` is gb-personal-only and has never been upstreamed.

### What to copy

Source file: `packages/plugins/agent-amp/src/index.ts` (151 lines on `feat/upstream-correctly-to-main`)

Key implementation details:
- `manifest.name = "amp"`, `slot = "agent" as const`, `displayName = "Amp"`
- `processName: "amp"`, `promptDelivery: "post-launch"`
- `getLaunchCommand()` → `"amp"` (no flags; prompt sent post-launch via `runtime.sendMessage()`)
- `getEnvironment()` → sets `AO_SESSION_ID`, optionally `AO_ISSUE_ID`; does NOT prepend `~/.ao/bin` (Amp has no PATH wrapper need)
- `detectActivity(output)` → `"idle"` if empty/whitespace, `"active"` otherwise
- `getActivityState()` cascade (must match CLAUDE.md spec):
  1. `isProcessRunning(session, handle)` → false → `{ state: "exited", timestamp: new Date().toISOString() }`
  2. `readLastActivityEntry(session.workspacePath)` → `checkActivityLogState(result)` → return if non-null
  3. `getActivityFallbackState(activityResult, DEFAULT_ACTIVE_WINDOW_MS, threshold ?? DEFAULT_READY_THRESHOLD_MS)` → return if non-null
  4. return `null`
- `isProcessRunning()` → tmux TTY `ps` lookup (process name regex matches `amp`), PID signal-0 fallback; return `false` (not null) on error
- `getSessionInfo()` → returns `null` (no JSONL / no resume)
- `detect()` → `execFileSync("amp", ["--version"])`, returns true/false

### Commits

**Commit 1:** `feat(agent-amp): add Amp CLI agent plugin`

Files to create:
- `packages/plugins/agent-amp/package.json`
  - name: `@composio/ao-plugin-agent-amp`, version `0.1.0`, type `module`
  - dep: `@composio/ao-core: workspace:*`
- `packages/plugins/agent-amp/tsconfig.json` — extend `../../../tsconfig.base.json`
- `packages/plugins/agent-amp/src/index.ts` — copy from source, replace `@aoagents` → `@composio`
- `packages/plugins/agent-amp/src/index.test.ts` — copy from source, fix imports
  - Must include all 7 required `getActivityState` test cases:
    1. Returns `exited` when process not running
    2. Returns `waiting_input` from JSONL
    3. Returns `blocked` from JSONL
    4. Returns `active` from JSONL fallback (fresh entry)
    5. Returns `idle` from JSONL fallback (old entry, age decay)
    6. Returns `null` when no data
    7. Returns `ready` from JSONL fallback (mid-age entry)

Files to modify:
- `packages/cli/src/lib/plugins.ts` — add `@composio/ao-plugin-agent-amp` to agent plugin imports (same pattern as `agent-codex`, `agent-aider`)
- `pnpm-workspace.yaml` — check if glob `packages/plugins/*` already covers it; if yes, no change needed; if explicit list, add `packages/plugins/agent-amp`
- `packages/web/src/app/api/agents/route.ts` — if this route exists on upstream, no change; if not, it will be added in PR4

### Validation

- `pnpm --filter @composio/ao-plugin-agent-amp test` passes
- `pnpm typecheck` clean
- `ao spawn --agent amp` launches without error (manual test)

---

## PR 2 — Terminal Layout: Fill Viewport + Touch Scroll + Font Size

**Branch:** `feat/upstream-terminal-layout`
**Upstream base:** `main`
**No dependencies on other PRs**

### Context

Two related problems solved together:
1. The terminal doesn't fill its available space — the page can scroll vertically outside the terminal, which is jarring
2. Mobile has no touch scroll support; desktop has no font size control

The fix is to make the terminal and its containing layout use full viewport height via CSS, preventing outside scrolling, while keeping sidebar and dashboard list sections independently scrollable.

### What exists in gb-personal

**`DirectTerminalGB.tsx` — font size (lines 16–27):**
- `FONT_SIZE_KEY = "ao:web:terminal-font-size"`
- `FONT_SIZE_MIN = 9`, `FONT_SIZE_MAX = 18`, `FONT_SIZE_DEFAULT = 13`
- `getStoredFontSize()` reads localStorage, clamps to range

**`DirectTerminalGB.tsx` — fit logic (lines 29–64):**
- Uses `getBoundingClientRect()` instead of `offsetWidth`/`offsetHeight` — more accurate at fractional pixel boundaries
- Corrects cols/rows if terminal content inflates measurements (overflow guard)

**`DirectTerminalGB.tsx` — terminal themes (lines 92–120):**
- `buildTerminalThemes(variant: "agent" | "orchestrator")` → `{ dark: ITheme; light: ITheme }`
- Agent accent: `#5b7ef8` (blue); orchestrator: `#a371f7` (violet)
- Full ANSI color set defined

**`packages/web/src/lib/terminal-touch-scroll.ts`:**
- `attachTouchScroll(el: HTMLElement, terminal: Terminal): () => void`
- Listens `touchstart`/`touchmove`/`touchend` on `el`
- Translates Y-delta to `terminal.scrollLines(n)`
- Returns cleanup function removing all listeners

**Layout height fix (in root layout + session page):**
- Layout must be `h-screen overflow-hidden` at root (`app/layout.tsx` body tag)
- Sidebar: `h-full overflow-y-auto` (scrolls independently)
- Dashboard kanban board: `overflow-y-auto` in its container (scrolls independently)
- Session page: `h-full flex flex-col` so terminal can grow to fill remaining height
- Terminal container: `flex-1 min-h-0` (critical — without `min-h-0` flex children don't shrink)

### Commits

**Commit 1:** `feat(web): fix terminal height to fill viewport, prevent outside scrolling`

Files to modify:
- `packages/web/src/app/layout.tsx`
  - `<body>` element: add `h-screen overflow-hidden` (alongside existing classes)
  - Main content wrapper (if any): `h-full overflow-hidden`
- `packages/web/src/app/sessions/[id]/page.tsx`
  - Page wrapper: `h-full flex flex-col`
  - Terminal section: `flex-1 min-h-0` (grows to fill, doesn't overflow)
- `packages/web/src/components/Dashboard.tsx`
  - Kanban scroll container: `overflow-y-auto` on the columns, not the page
- `packages/web/src/components/__tests__/layout-height.test.tsx` (or add to existing layout test)
  - Test: session page renders terminal in flex-fill container

**Commit 2:** `feat(web): add touch scroll, font size control, and accurate fit to DirectTerminal`

Files to create:
- `packages/web/src/lib/terminal-touch-scroll.ts` (copy from source)
  - Export: `attachTouchScroll(el: HTMLElement, terminal: Terminal): () => void`
  - No external deps beyond xterm.js types

Files to modify:
- `packages/web/src/components/DirectTerminal.tsx`
  1. Add at top: `FONT_SIZE_KEY`, `FONT_SIZE_MIN=9`, `FONT_SIZE_MAX=18`, `FONT_SIZE_DEFAULT=13`, `getStoredFontSize()`
  2. Add `fontSize` state: `const [fontSize, setFontSize] = useState(getStoredFontSize)`
  3. Replace `offsetWidth`/`offsetHeight` → `getBoundingClientRect()` in fit function
  4. Add `buildTerminalThemes(variant)` for accent colors (if not already present)
  5. In terminal mount `useEffect`: `const cleanup = attachTouchScroll(containerRef.current, term); return cleanup`
  6. Add `useEffect([fontSize])`: `term.options.fontSize = fontSize; localStorage.setItem(FONT_SIZE_KEY, String(fontSize)); fitTerminal()`
  7. Add font stepper to toolbar: `−` (disabled at 9) | `{fontSize}px` | `+` (disabled at 18)
  8. Stepper buttons: `className="w-6 h-6 text-xs flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-40"`

Files to create:
- `packages/web/src/components/__tests__/DirectTerminal.test.tsx` (if not present on upstream) OR add tests to existing file:
  - Test: font size loads from localStorage on mount
  - Test: `+` button increments font size, writes to localStorage
  - Test: `−` button decrements font size, writes to localStorage
  - Test: font size clamped to 9 and 18
  - Test: `attachTouchScroll` called on mount, cleanup on unmount

### Validation

- Open session page at 100% zoom → no vertical scrollbar on body
- Mobile viewport (375px) → touch-drag scrolls terminal content, not page
- `+`/`−` buttons change font size → persists on reload
- Resize browser window → terminal refits correctly (no overflow)
- Dashboard page → kanban board still scrolls independently (list is long)

---

## PR 3 — Topbar, Sidebar, Hamburger Menu

**Branch:** `feat/upstream-topbar-sidebar-hamburger`
**Upstream base:** `main`
**No dependencies on other PRs**

### Design Decision: Prefer Upstream's Chrome, Add Our Flavors

Upstream `main` has a topbar and sidebar layout. We like upstream's approach where the
**topbar spans full width above the side-panel** (not constrained within the content area).
We keep that structure and enhance it with our flavors:

**Sidebar flavors to add on top of upstream's sidebar:**
1. **Filters** — "Show killed" / "Show done" toggle buttons (already exist in gb-personal `ProjectSidebar.tsx`)
2. **Per-project action buttons** — 2 buttons per project row (e.g., "Spawn" and a context menu / settings icon)
3. **Session ID subheader** — show `ao-123` (short session ID) as a small subheader beneath each session row label

**Topbar flavors to add on top of upstream's topbar:**
- Hamburger menu button (left side) for mobile sidebar toggle — shown only when `projects.length > 1`
- Reconnection indicator pill (shown when WebSocket is offline)

**What NOT to do:** Do not replace upstream's topbar/sidebar with our `DashboardCompactTopBar.tsx` wholesale.
Instead, modify `Dashboard.tsx` and `ProjectSidebar.tsx` in-place to add our enhancements.

### What exists in gb-personal

**`ProjectSidebar.tsx` props (lines 20–32):**
```typescript
interface ProjectSidebarProps {
  projects: ProjectInfo[];
  sessions: DashboardSession[];
  orchestrators?: DashboardOrchestratorLink[];
  activeProjectId: string | undefined;
  activeSessionId: string | undefined;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  mobileOpen?: boolean;           // ← our addition
  onMobileClose?: () => void;     // ← our addition
  isLoading?: boolean;
  onSessionCreated?: (session: DashboardSession) => void;
}
```

Mobile overlay CSS (in `globals.css`):
```css
.sidebar-wrapper {
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}
.sidebar-wrapper.mobile-open {
  transform: translateX(0);
}
```

**`ReconnectingPill.tsx`:**
- Small pill: `"Reconnecting..."` shown when WebSocket is disconnected
- Props: `visible: boolean`

**`DashboardCompactTopBar.tsx` (48 lines) — use as reference, not wholesale:**
- Shows hamburger icon only when multi-project + sidebar context has toggle
- Left: hamburger + title; Right: children slot

**`SidebarContext.tsx`:**
- Context providing `{ onToggleSidebar, isMobile }` to nested components

**Sidebar "show killed / show done" filters (in `ProjectSidebar.tsx`):**
- `showKilled: boolean` / `showDone: boolean` state
- Toggle buttons at top of session list or bottom of sidebar
- `sidebarSessionRowVisible(session, showKilled, showDone)` helper

**Session ID subheader (in `SessionCardGB.tsx` / `ProjectSidebar.tsx` session rows):**
- Show `ao-${session.id.slice(0, 6)}` (or `session.metadata?.issueLabel` if present)
- Small `text-xs text-[var(--color-text-muted)]` beneath session title

**Per-project action buttons:**
- "Spawn" button per project row → opens `SpawnSessionModal` for that project
- Settings/context icon → project settings or link

**`layout.tsx` mobile sidebar state:**
- `mobileSidebarOpen: boolean` state
- `onToggleSidebar()`: desktop → flip `sidebarCollapsed`; mobile (viewport < 768px) → flip `mobileSidebarOpen`
- `SidebarContext.Provider` wraps layout with `{ onToggleSidebar }`

### Commits

**Commit 1:** `feat(web): add mobile sidebar overlay, hamburger toggle, and reconnect indicator`

Files to create:
- `packages/web/src/components/ReconnectingPill.tsx` (copy from source)
- `packages/web/src/components/workspace/SidebarContext.tsx` (copy from source)

Files to modify:
- `packages/web/src/components/ProjectSidebar.tsx` (modify upstream's version — do NOT replace)
  - Add `mobileOpen?: boolean`, `onMobileClose?: () => void` to props interface
  - Wrap sidebar element in `<div className={`sidebar-wrapper${mobileOpen ? " mobile-open" : ""}`}>`
  - Add backdrop: `{mobileOpen && <div className="fixed inset-0 bg-black/40 z-40" onClick={onMobileClose} />}`
  - Add `showKilled`/`showDone` state + toggle buttons (copy filter logic from gb-personal `ProjectSidebar.tsx`)
  - Add session ID subheader to each session row: `<span className="text-xs text-[var(--color-text-muted)]">ao-{session.id.slice(0, 6)}</span>` (or `session.metadata?.issueLabel` if set)
  - Add 2 action buttons per project row: Spawn button (opens modal) + settings icon
- `packages/web/src/app/globals.css`
  - Add `.sidebar-wrapper` off-canvas CSS (copy from gb-personal)
- `packages/web/src/app/layout.tsx` (upstream's root layout — no route groups)
  - Add `mobileSidebarOpen` state
  - Wrap in `SidebarContext.Provider` with `{ onToggleSidebar }`
  - Pass `mobileOpen`, `onMobileClose` to `ProjectSidebar`
  - `onToggleSidebar`: check `window.innerWidth < 768` to decide which state to toggle

**Commit 2:** `feat(web): add hamburger and reconnect pill to topbar`

Files to modify:
- `packages/web/src/components/Dashboard.tsx` (modify upstream's topbar — do NOT replace with DashboardCompactTopBar)
  - Add hamburger icon button to left of topbar: `onClick={sidebar?.onToggleSidebar}`, shown only when `projects.length > 1`
  - Import `useSidebarContext` from `SidebarContext`
  - Add `<ReconnectingPill visible={!wsConnected} />` to topbar right section

Note: `DashboardCompactTopBar.tsx` from gb-personal can be **deleted** — do not add it to upstream.
Its hamburger logic belongs in the existing topbar component.

Files to create:
- `packages/web/src/components/__tests__/ProjectSidebar.test.tsx` (if not on upstream, or add to existing)
  - Test: `mobile-open` class present when `mobileOpen=true`
  - Test: backdrop renders when `mobileOpen=true`, `onMobileClose` called on click
  - Test: "Show killed" toggle changes filter state
  - Test: "Show done" toggle changes filter state
  - Test: session row shows `ao-{id}` subheader

### Validation

- Mobile viewport (375px): sidebar hidden; hamburger button visible; tap → sidebar slides in
- Tap backdrop → sidebar closes
- Desktop: hamburger collapses sidebar to icon-only
- "Show killed" toggle filters session list
- Each project row has Spawn + settings buttons
- Session rows show `ao-abc123` beneath session title
- WebSocket disconnect → ReconnectingPill appears in topbar

### Known issues observed during testing (fix before merge)

- **Mobile session page: back button instead of hamburger** — upstream renders a "back" button on the session page on mobile. Replace with the hamburger/sidebar toggle button matching gb-personal behavior, and animate the sidebar slide-in on mobile (off-canvas with CSS transition).
- **Session prefix collision** — sessions from different AO projects (e.g. `ao-` and `unl-`) collapse under a single project because the prefix matching logic groups them incorrectly. Check `Dashboard.tsx` / `ProjectSidebar.tsx` project grouping logic against gb-personal.
- **Terminal blank on session open** — terminal pane renders blank when navigating to a session. Likely a timing issue with the WebSocket connection or fit call before the container is visible. Check `DirectTerminal.tsx` initialization sequence and ensure fit is called after the element is visible (ResizeObserver or `useLayoutEffect`).
- **`/sessions?project=...` calls canceled** — many SSE/fetch calls to the sessions endpoint are being aborted. Check `useSessionEvents` hook abort controller logic and whether upstream's polling is compatible with the current server.

---

## PR 4 — Configurable Agent Base Prompt (UI + Backend)

**Branch:** `feat/upstream-configurable-base-prompt`
**Upstream base:** `main`
**No dependencies on other PRs** (builds on existing config + core, no UI deps)

### Context

gb-personal has a customized base prompt that biases agents toward planning before acting
(specifically: write a plan file first, wait for approval, then execute rather than immediately
opening PRs). This customization currently lives as a hardcoded override in
`packages/core/src/prompt-builder.ts`.

The goal of this PR is to make the base prompt **configurable from the UI** so users can
tune agent behavior without editing YAML. This is a greenfield feature — no source file to
copy from gb-personal. The plan here is enough for Haiku to implement from scratch.

### Design

**Config storage:** Extend `agent-orchestrator.yaml` schema with an optional `promptOverrides` block.
Web UI reads and writes this via a new API route. Overrides are merged into the prompt by
`prompt-builder.ts`.

**UI surface:** A "Prompt Settings" panel in the session spawn modal (PR5) or a dedicated
settings page. Minimum viable: a textarea in a settings page reachable from the topbar.

**Prompt layers (existing):**
1. Base prompt (hardcoded in `prompt-builder.ts`)
2. Config prompt (from `agent-orchestrator.yaml` → `agentConfig.prompt`)
3. Rules file (`.agent-rules.md` in repo)

**New layer 2.5 — UI-editable prompt additions:**
- `promptOverrides.prefix` — prepended after base prompt, before config prompt
- `promptOverrides.suffix` — appended after rules file (last thing the agent reads)

**Key behaviors to expose as toggles (rendered as checkboxes in UI, compiled to prompt text):**
- `planFirst: boolean` (default `false` on upstream) — instructs agent to write a plan file
  and wait for approval before executing. When enabled, adds to prefix:
  > "Before starting work, create a plan file at `.feature-plans/wip/{slug}.md` using the
  > template in `.feature-plans/_plan_sample_format.md`. Wait for the user to review
  > and approve the plan before proceeding with implementation."
- `noPRUntilApproved: boolean` (default `false`) — instructs agent not to open a PR
  until the user explicitly approves. Adds to suffix:
  > "Do not open a pull request until the user has reviewed your work and given explicit approval."

**Storage:** `~/.agent-orchestrator/prompt-settings.json` (outside YAML to avoid dirtying the config file).
Web UI reads/writes this file via API.

### Commits

**Commit 1:** `feat(core): add prompt override support to prompt-builder`

Files to modify:
- `packages/core/src/prompt-builder.ts`
  - Add `PromptOverrides` type: `{ prefix?: string; suffix?: string; planFirst?: boolean; noPRUntilApproved?: boolean }`
  - Export it from `packages/core/src/index.ts`
  - `buildPrompt(config, overrides?: PromptOverrides)`:
    - If `overrides.planFirst`: append plan-first instruction to prefix
    - If `overrides.noPRUntilApproved`: append no-PR instruction to suffix
    - If `overrides.prefix`: insert after base prompt
    - If `overrides.suffix`: append after rules file
- `packages/core/src/__tests__/prompt-builder.test.ts`
  - Test: `planFirst: true` adds plan instruction to assembled prompt
  - Test: `noPRUntilApproved: true` adds no-PR instruction
  - Test: custom `prefix`/`suffix` appear in correct positions
  - Test: no overrides → same output as before (no regression)

**Commit 2:** `feat(web): add prompt settings API and UI panel`

Files to create:
- `packages/web/src/app/api/prompt-settings/route.ts`
  - GET: read `~/.agent-orchestrator/prompt-settings.json`, return parsed `PromptOverrides`; return `{}` if file missing
  - POST: validate body as `PromptOverrides` (Zod), write to file, return saved value
  - File path: `path.join(os.homedir(), ".agent-orchestrator", "prompt-settings.json")`
- `packages/web/src/components/PromptSettingsPanel.tsx`
  - Fetches GET `/api/prompt-settings` on mount
  - Renders:
    - Checkbox: "Plan before acting" (`planFirst`) — with tooltip explaining what it does
    - Checkbox: "Don't open PR until approved" (`noPRUntilApproved`)
    - Textarea: "Additional prompt prefix" (`prefix`) — freeform, placeholder example
    - Textarea: "Additional prompt suffix" (`suffix`) — freeform
    - Save button → POST `/api/prompt-settings`
    - Success/error toast feedback
  - Styling: consistent with existing settings panels (no new component libraries)
- `packages/web/src/components/__tests__/PromptSettingsPanel.test.tsx`
  - Test: loads and displays current settings
  - Test: toggling `planFirst` updates state
  - Test: save calls POST with correct body
  - Test: shows success state after save

Files to modify:
- `packages/web/src/components/Dashboard.tsx` AND `packages/web/src/components/SessionDetail.tsx`
  - Add "Prompt Settings" button (gear icon) inside the existing `<header className="dashboard-app-header">` (right side, alongside the existing PR / Kill / Orchestrator buttons)
  - Both components own their own header copy on `feat/upstream-pr2-pr3` — add the button to both
  - Clicking it renders `<PromptSettingsPanel>` in a slide-out panel or modal portaled to `document.body`
- `packages/web/src/lib/services.ts`
  - Load `prompt-settings.json` at startup, pass `PromptOverrides` to `promptBuilder`
  - On each spawn: read latest settings and include in prompt assembly

### Validation

- GET `/api/prompt-settings` returns `{}` on fresh install
- Enable "Plan before acting" + save → spawn session → agent's first message mentions plan file
- Disable → spawn → no plan instruction in prompt
- Custom prefix textarea → text appears at start of agent's context
- Settings persist across server restart

---

## PR 5 — New Session UI + Spawn Backend  <!-- renumbered from original PR4 -->

**Branch:** `feat/upstream-new-session-ui`
**Upstream base:** `main`
**No dependencies on other PRs** (agent dropdown is dynamic; Amp will appear once PR1 lands)

### What exists in gb-personal

**`SpawnSessionModal.tsx` (267 lines):**
- Fetches `/api/agents` → `{ agents: { name, displayName?, description? }[] }` on modal open
- Fields: issue ID (optional), intro prompt (textarea), agent dropdown
- Optimistic stub: creates `spawning-${Date.now()}` session immediately, closes modal
- POST `/api/spawn` body: `{ projectId, issueId, prompt, agent }`
- `onSessionCreated(stub)` → sidebar shows it immediately
- On spawn success: calls `onSessionCreated(realSession)` → stub replaced
- Portaled to `document.body` via `createPortal` with `typeof document !== "undefined"` guard
- Escape key closes

**`/api/spawn/route.ts` (fix `257cd10f`):**
- Reads `agent?: string` from POST body
- Forwards to `sessionManager.spawn({ ..., agent })`

**`/api/agents/route.ts`** (may not exist on upstream — must create):
- GET: list registered agent plugins from plugin registry
- Return: `{ agents: { name: string; displayName?: string; description?: string }[] }`

**`DashboardSession` type compatibility:** Before copying `SpawnSessionModal`, verify that
the `DashboardSession` fields used in the stub object (`id`, `status`, `projectId`, `createdAt`, etc.)
exist on upstream's `packages/web/src/lib/types.ts`. The stub only needs minimal fields — check
which ones `Dashboard.tsx` reads from sessions in the list and include only those.

### Commits

**Commit 1:** `feat(web): add /api/agents route and agent field to spawn endpoint`

Files to create:
- `packages/web/src/app/api/agents/route.ts`
  - GET: `const { pluginRegistry } = await getServices()`
  - `pluginRegistry.listBySlot("agent")` → map to `{ name, displayName, description }`
  - Return `Response.json({ agents })`

Files to modify:
- `packages/web/src/app/api/spawn/route.ts`
  - Add `agent: z.string().optional()` to Zod body schema
  - Pass `agent` to `sessionManager.spawn()`
- `packages/core/src/types.ts` or `session-manager.ts` (if `SessionSpawnConfig.agent` not in upstream)
  - Add `agent?: string` to `SessionSpawnConfig`
- `packages/core/src/__tests__/session-manager.test.ts`
  - Test: `spawn()` with `agent: "amp"` resolves amp plugin
  - Test: `spawn()` without `agent` uses config default

**Commit 2:** `feat(web): add spawn session modal with agent selector and optimistic UI`

Files to create:
- `packages/web/src/components/SpawnSessionModal.tsx` (copy from source, fix imports)
  - Verify `DashboardSession` stub fields match upstream type before copying
  - Keep `createPortal(modal, document.body)` with SSR guard

Files to modify:
- `packages/web/src/components/Dashboard.tsx`
  - Add "New Session" button in kanban header (or topbar)
  - Add `<SpawnSessionModal>` with `onSessionCreated` handler
  - Handler: replace `spawning-*` stub → real session:
    ```typescript
    setSessions(prev => {
      const without = prev.filter(s => s.id !== stub.id);
      return [real, ...without];
    });
    ```

Files to create:
- `packages/web/src/components/__tests__/SpawnSessionModal.test.tsx`
  - Test: agent dropdown populated from `/api/agents`
  - Test: POST body includes `agent` field
  - Test: `onSessionCreated` called immediately with stub (modal already closed)
  - Test: `onSessionCreated` called again with real session on spawn success
  - Test: escape key calls `onClose`
  - Test: portal renders modal in `document.body`

### Validation

- New Session button in dashboard → modal opens
- Agent dropdown lists all registered agents
- Submit → modal closes immediately, stub appears in sidebar
- Real session arrives → stub replaced, navigate to session page

---

## PR 6a — File Tree + Preview: Backend API Routes  <!-- renumbered from original PR7a -->

**Branch:** `feat/upstream-file-tree-api`
**Upstream base:** `main`
**No dependencies on other PRs**

### Context

Three new read-only API routes for file browsing in a session worktree.
All routes include path traversal protection and a 60s workspace cache.

### What exists in gb-personal

**Security pattern (from `257cd10f` fix):**
```typescript
// Path traversal protection — correct implementation:
const resolved = path.resolve(worktreePath, ...pathSegments);
const safeRoot = worktreePath.endsWith("/") ? worktreePath : worktreePath + "/";
if (resolved !== worktreePath && !resolved.startsWith(safeRoot)) {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
```
Note: `resolved.startsWith(worktreePath)` alone is vulnerable (prefix attack).
Always append `/` before the check.

**Workspace cache pattern (from `257cd10f`):**
```typescript
const workspaceCache = new Map<string, { path: string; expires: number }>();
const CACHE_TTL = 60_000;
async function getWorkspacePath(sessionId: string): Promise<string | null> {
  const cached = workspaceCache.get(sessionId);
  if (cached && cached.expires > Date.now()) return cached.path;
  const { sessionManager } = await getServices();
  const session = await sessionManager.get(sessionId as SessionId);
  if (!session?.workspacePath) return null;
  workspaceCache.set(sessionId, { path: session.workspacePath, expires: Date.now() + CACHE_TTL });
  return session.workspacePath;
}
```

**`GET /api/sessions/[id]/files` — file tree + git status:**
- `getGitStatus(worktreePath)`: `git status --porcelain=v1 -uall` → `Record<string, GitStatus>` where `GitStatus = "M" | "A" | "D" | "?" | "R"`
- `buildTree(dirPath, rootPath)`: recursive `fs.readdir`; skip `.git`, `node_modules`, `.next`, `dist`, `build`; sort dirs first, then alpha
- `FileNode = { name: string; path: string; type: "file"|"directory"; children?: FileNode[] }`
- Response: `{ tree: FileNode[]; gitStatus: Record<string, GitStatus> }`

**`GET /api/sessions/[id]/files/[...path]` — file content:**
- Path traversal check (see above)
- Binary extension reject list (copy from gb-personal): `.png .jpg .jpeg .gif .svg .ico .woff .woff2 .ttf .eot .mp4 .webm .zip .gz .tar .pdf .exe .bin`
- Read file as UTF-8
- ETag: `"f-${mtime.getTime()}-${size}"` (quoted string)
- 304 Not Modified if `if-none-match` matches ETag
- Response: file content as `text/plain` with ETag header

**`GET /api/sessions/[id]/diff/[...path]` — git diff or untracked content:**
- Same path validation + binary check
- `MAX_DIFF_BYTES = 512 * 1024`, `MAX_UNTRACKED_READ = 1024 * 1024`
- Single-file git status: `git status --porcelain -- filePath`
- Untracked (`?`): stat file (reject if > 1MB), read content → `{ path, status: "?", diff: null, content: string }`
- Tracked: `git diff HEAD -- filePath`, slice to 512KB → `{ path, status, diff: string, content: null }`
- ETag: `"u-${mtime}-${size}"` for untracked, `"d-${Buffer.from(diff).toString("base64").slice(0,16)}"` for diffs
- 304 Not Modified support

### Commits

**Commit 1:** `feat(web): add file tree, file content, and diff API routes`

Files to create (copy from source, fix traversal check to use `safeRoot` pattern):
- `packages/web/src/app/api/sessions/[id]/files/route.ts`
- `packages/web/src/app/api/sessions/[id]/files/[...path]/route.ts`
- `packages/web/src/app/api/sessions/[id]/diff/[...path]/route.ts`

**Commit 2:** `test(web): add unit tests for file and diff API routes`

Files to create:
- `packages/web/src/app/api/sessions/[id]/files/__tests__/route.test.ts`
  - Test: returns tree and gitStatus
  - Test: ignores node_modules, .git dirs
  - Test: sorts dirs before files
  - Test: 404 for unknown session
- `packages/web/src/app/api/sessions/[id]/files/__tests__/path-route.test.ts`
  - Test: returns file content
  - Test: 403 for path traversal attempt (`../../etc/passwd`)
  - Test: 422 for binary extension
  - Test: 304 when ETag matches
- `packages/web/src/app/api/sessions/[id]/diff/__tests__/route.test.ts`
  - Test: returns diff for modified file
  - Test: returns content for untracked file
  - Test: 403 for traversal attempt
  - Test: 422 for binary extension
  - Test: truncates diff at 512KB

### Validation

- `GET /api/sessions/:id/files` returns valid JSON with tree + git status
- `GET /api/sessions/:id/files/src/index.ts` returns file content
- `GET /api/sessions/:id/files/../../etc/passwd` → 403
- `GET /api/sessions/:id/diff/src/index.ts` returns git diff
- All tests pass

---

## PR 6b — File Tree UI + Workspace Layout  <!-- renumbered from original PR7b -->

**Branch:** `feat/upstream-workspace-ui`
**Upstream base:** `main` (after PR2/PR3 merged via `feat/upstream-pr2-pr3`)
**Depends on:** PR 6a (API routes); PR 2 + PR 3 (already in `feat/upstream-pr2-pr3` — terminal fill, dashboard-app-shell layout)
**Does NOT depend on PR 7 (Sub-Sessions):** terminal pane uses bare `<DirectTerminal>` for now; PR 7 swaps it in afterwards.

### Context

- Full workspace UI: resizable 3-pane layout (file tree | preview | terminal)
- File tree with git status colors, diff viewer, code block, markdown preview, mermaid diagrams
- Wraps the **existing terminal-fills-height** layout from PR2/PR3, does not replace it

### Layout integration with `feat/upstream-pr2-pr3` (CRITICAL — read first)

After PR2/PR3, `SessionDetail.tsx` owns the chrome:
- Outer `<SidebarContext.Provider>` wraps everything
- `<div className="dashboard-app-shell">` wraps header + shell
- `<header className="dashboard-app-header">` — hamburger, brand, project label, status pill, branch pill, headline, PR popover, Kill/Restore, Orchestrator link
- `<div className="dashboard-shell dashboard-shell--desktop">` — sidebar wrapper + main
  - `<div className="sidebar-wrapper">` containing `<ProjectSidebar>`
  - `<main className="session-detail-page flex-1 min-h-0 flex flex-col">` containing the terminal `<div className="flex-1 min-h-0 flex flex-col">` and `<DirectTerminal height="100%" />`
- `<MobileBottomNav>` outside the shell
- File: `packages/web/src/components/SessionDetail.tsx` lines ~360–810

PR6b changes ONLY the inside of `<main className="session-detail-page">`:
- The single terminal `<div className="flex-1 min-h-0 flex flex-col">` block becomes `<WorkspaceLayout>` rendering `[fileTree, preview, terminal]`
- `WorkspaceLayout` itself must use `flex-1 min-h-0 h-full` so it inherits the terminal-fill behavior from PR2
- Header, sidebar, mobile bottom nav are untouched

**Do NOT introduce a new `(with-sidebar)` layout file.** The PR2/PR3 chrome lives inside SessionDetail; keep it that way.

### What exists in gb-personal

**`FileTree.tsx`:**
- Git status colors: A/? → `#3fb950`, M → `#d29922`, D → `#f85149`
- `getDirGitColor(node, gitStatus)`: propagates worst child status to parent dir
- `FileTreeNode`: recursive expand/collapse, click selects file
- `filterTreeToChanged(tree, gitStatus)`: prune to only files with git status (from `fileTreeFilter.ts`)

**`FilePreview.tsx`:**
- Renders in `<CodeBlock>` for source files
- Shows `<DiffViewer>` when diff mode active
- Loading skeleton, binary/empty state

**`DiffViewer.tsx` + `diffParse.ts`:**
- Parses unified diff into `{ hunks: [{ header, lines: [{ type: "add"|"remove"|"context", content }] }] }`
- Color: added (`bg-green-950`), removed (`bg-red-950`), context (default)
- Line numbers in left gutter

**`CodeBlock.tsx` + `codeHighlight.ts`:**
- `highlight.js` for syntax highlighting
- Language detected from file extension
- `previewFontSize` prop (9–18px, persisted separately from terminal font)

**`MermaidDiagram.tsx`:**
```typescript
const Mermaid = dynamic(() => import("./MermaidInner"), { ssr: false, loading: () => <div className="h-40 animate-pulse bg-white/5 rounded" /> });
```
- Inner component calls `mermaid.render(id, code)`, sets `innerHTML`

**`WorkspaceLayout.tsx`:**
- Render-prop children: `{ fileTree(selectedFile, opts), preview(selectedFile, opts), terminal }`
- Default pane sizes: `[20, 40, 40]` (stored in localStorage `ao:web:pane-sizes:${sessionId}`)
- State: `sizes`, `collapsed` (file tree toggle), `previewFontSize`, `quickOpenVisible`, `showChangedOnly`
- `fileTreeSettings` in localStorage `ao:web:workspace-settings`: `{ autoCloseOnTreeSelect, autoCloseOnQuickOpen, autoCloseOnDiffSelect }`
- URL sync: `router.replace({ query: { file: selectedPath } })` on file select
- Keyboard: `Cmd+P` → `setQuickOpenVisible(true)`

**`ResizablePanes.tsx`:**
- Drag-to-resize with `mousedown`/`mousemove`/`mouseup` + `touchstart`/`touchmove`/`touchend`
- Props: `sizes: number[]`, `onSizesChange: (sizes: number[]) => void`, `children: ReactNode[]`
- Renders children interleaved with draggable dividers

**`usePaneSizes.ts`:**
- localStorage key `ao:web:pane-sizes:${sessionId}`
- Validates saved sizes sum to ~100 before applying

**`workspace.css`:**
- Custom scrollbar styles for file tree (thin, dark)
- `.workspace-pane` base styles
- Import location: `packages/web/src/app/globals.css` (add `@import "../components/workspace/workspace.css"`)

**Markdown prose in SessionDetail (or standalone MarkdownPreview component):**
- `react-markdown` + `remark-gfm` + `rehype-highlight`
- Monochrome heading ladder: h1 `text-2xl font-bold`, h2 `text-xl font-semibold`, h3 `text-lg font-medium`, all in `text-[var(--color-text-primary)]` (no rainbow colors)
- Dark prose: `prose-invert` with `prose-p:text-[var(--color-text-secondary)]` for reduced contrast
- Mermaid block detection: intercept ` ```mermaid ` nodes → render `<MermaidDiagram code={...} />`

**New npm deps to add to `packages/web/package.json`:**
```json
"mermaid": "^10.x",
"react-markdown": "^9.x",
"rehype-highlight": "^7.x",
"remark-gfm": "^4.x",
"highlight.js": "^11.x"
```

### Commits

**Commit 1:** `feat(web): add file tree, diff viewer, and code block workspace components`

Files to create (copy from source, fix imports):
- `packages/web/src/components/workspace/FileTree.tsx`
- `packages/web/src/components/workspace/FilePreview.tsx`
- `packages/web/src/components/workspace/DiffViewer.tsx`
- `packages/web/src/components/workspace/diffParse.ts`
- `packages/web/src/components/workspace/CodeBlock.tsx`
- `packages/web/src/components/workspace/codeHighlight.ts`
- `packages/web/src/components/workspace/fileTreeFilter.ts`
- `packages/web/src/components/workspace/sessionFileState.ts`
- `packages/web/src/components/workspace/useFileTree.ts`
- `packages/web/src/components/workspace/useFileContent.ts`
- `packages/web/src/components/workspace/useDiffContent.ts`
- `packages/web/src/components/workspace/MermaidDiagram.tsx` (with `next/dynamic`, `ssr: false`)
- `packages/web/src/components/workspace/QuickOpen.tsx`
- `packages/web/src/components/workspace/workspace.css`

Files to modify:
- `packages/web/package.json` — add 5 new deps (run `pnpm install` after)
- `packages/web/src/app/globals.css` — add `@import` for `workspace.css`

Files to create:
- `packages/web/src/components/workspace/__tests__/FileTree.test.tsx`
  - Test: renders file tree nodes
  - Test: M status → orange color on file node
  - Test: A status → green color
  - Test: directory color propagates from worst child
  - Test: `showChangedOnly` hides unmodified files
  - Test: click on file calls `onSelect` callback

**Commit 2:** `feat(web): add resizable 3-pane workspace layout with markdown and mermaid`

Files to create (copy from source, fix imports):
- `packages/web/src/components/workspace/ResizablePanes.tsx`
- `packages/web/src/components/workspace/usePaneSizes.ts`
- `packages/web/src/components/workspace/WorkspaceLayout.tsx`

Files to modify:
- `packages/web/src/components/SessionDetail.tsx`
  - **Do NOT touch the `<header className="dashboard-app-header">` or `<ProjectSidebar>` blocks** — they are owned by PR2/PR3
  - Locate the inner block `<div className="flex-1 min-h-0 flex flex-col">{/* terminal */}</div>` inside `<main className="session-detail-page">` (around line ~770 on `feat/upstream-pr2-pr3`)
  - Replace just the terminal `<div>` with `<WorkspaceLayout session={session} className="flex-1 min-h-0">` rendering:
    - `fileTree` render prop: `(selectedFile, opts) => <FileTree ... />`
    - `preview` render prop: `(selectedFile, opts) => <FilePreview ... />`
    - `terminal` prop: existing `<DirectTerminal sessionId={...} variant={terminalVariant} height="100%" .../>` (will be swapped to `<SessionTerminalTabs>` in PR 7)
  - Preserve `terminalEnded` placeholder branch — only mount `WorkspaceLayout` when terminal is alive
  - Keep the `showTerminal` rAF guard before mounting WorkspaceLayout (avoids xterm fit on hidden node — see fix `93a71a57`)
- `packages/web/src/components/workspace/WorkspaceLayout.tsx`
  - Root must be `h-full min-h-0 flex flex-col` so it grows inside `<main className="session-detail-page flex-1 min-h-0 flex flex-col">`
  - Each pane wrapper must include `min-h-0` (critical for nested flex children)

Files to create:
- `packages/web/src/components/workspace/__tests__/WorkspaceLayout.test.tsx`
  - Test: all 3 panes render
  - Test: `Cmd+P` opens QuickOpen overlay
  - Test: file selection updates URL `?file=` param
  - Test: pane sizes loaded from localStorage
  - Test: "show changed only" toggle filters file tree

### Validation

- Open session with active worktree → file tree renders (left pane)
- Click modified file → diff view in preview pane (M = orange in tree)
- Click untracked file → full content in preview
- Open `.md` file with `\`\`\`mermaid\`\`\`` block → diagram renders as SVG
- Drag pane divider → sizes update and persist on reload
- `Cmd+P` → fuzzy file search overlay
- No vertical scroll on outer page (terminal fills remaining height from PR 2)

---

## PR 7 — Sub-Sessions + Spawn Dialog  <!-- renumbered from original PR6 -->

**Branch:** `feat/upstream-sub-sessions`
**Upstream base:** `main` (after PR2/PR3 + PR5 merged; PR5 is the source of `SpawnSessionModal` which we extend)
**Depends on:** PR 5 (SpawnSessionModal — we copy & adapt it for sub-sessions); PR 6b (WorkspaceLayout — terminal pane is where tabs live; PR7 swaps `<DirectTerminal>` → `<SessionTerminalTabs>` inside the workspace's terminal slot)

### Conceptual model

- See `subsession-concept.md` (sibling file) for the full mental model
- A sub-session is an extra tmux pane inside the same worktree as a parent session
- `type: "primary"` = the agent itself; `type: "terminal"` = an extra pane (no agent attached by default in gb-personal)
- **NEW in this upstream PR**: extra panes can also have an agent **attached at creation time** with a per-pane prompt — see "Evolved spawn flow" below

### What exists in gb-personal (baseline behaviour)

**Core types (`packages/core/src/types.ts` lines 232–246 on `feat/upstream-correctly-to-main`):**
```typescript
interface SubSession {
  id: string;                 // e.g. "ao-3-t1"
  parentId: SessionId;        // e.g. "ao-3"
  type: "primary" | "terminal";
  tmuxName: string;           // e.g. "ao-3-t1"
  workspacePath: string;      // shared with parent worktree
  runtimeHandle: RuntimeHandle | null;
  alive: boolean;
}
```

**`SessionManager` interface additions (`packages/core/src/types.ts` lines 1461–1465):**
```typescript
createSubSession(sessionId: SessionId, options?: CreateSubSessionOptions): Promise<SubSession>
listSubSessions(sessionId: SessionId): Promise<SubSession[]>
killSubSession(sessionId: SessionId, subSessionId: string): Promise<void>
restoreTerminalSubSession(parentSessionId: SessionId, subSessionId: SessionId): Promise<SubSession>
```

In gb-personal, `createSubSession` takes only `(sessionId)` — the new pane has no prompt and no agent. PR7 evolves this contract (see below).

**API routes (in `app/api/sessions/[id]/sub-sessions/`):**
- `route.ts`: GET list → `{ subSessions }`, POST create → `{ subSession }` (201)
- `[subId]/route.ts`: DELETE kill
- `[subId]/restore/route.ts`: POST restore → `{ subSession }`

**`SessionTerminalTabs.tsx` (335 lines on gb-personal):**
- Imports `DirectTerminalGB as DirectTerminal` — for upstream change to `import { DirectTerminal } from "@/components/DirectTerminal"`
- `MAX_TERMINAL_SUB_SESSIONS = 5` (enforced server-side)
- Polls `/sub-sessions` every 3s with `polling` ref guard
- Auto-prunes dead terminals client-side (skips while a create is in flight to avoid race)
- `Cmd+Shift+L` / `Cmd+Shift+H` = next/prev tab
- "+" button currently calls `addTerminal()` → POST with no body → no agent, no prompt

**`sessionTerminalTabState.ts`:**
- Key: `ao:web:terminal-tab:${sessionId}`, stored in `sessionStorage`
- `loadSessionTerminalTabState(id) / saveSessionTerminalTabState(id, subId)`

**`cn` utility:** `SessionTerminalTabs.tsx` uses `cn` from `@/lib/cn`. Verify on upstream `main`; if missing, create:
```typescript
// packages/web/src/lib/cn.ts
import { clsx, type ClassValue } from "clsx"; import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```
(Check `clsx` and `tailwind-merge` in `packages/web/package.json`.)

### Evolved spawn flow (NEW for upstream — diverges from gb-personal)

**Why:** in gb-personal, clicking "+" creates a bare tmux pane with no agent and no prompt. Users complained they have to manually launch `claude` / `codex` / etc. inside the new pane every time. The new flow asks **once** at creation, then runs the agent + sends the prompt automatically.

**Flow:**
1. User clicks "+" in `SessionTerminalTabs`
2. Opens `SpawnSubSessionModal` (new component, see PR5's `SpawnSessionModal` for the pattern)
3. Modal fields:
   - **Issue ID** (text): pre-filled from `parentSession.issueId`, marked `readOnly` and visually locked (greyed input + small lock icon + tooltip "Inherited from parent session")
   - **Agent** (dropdown): same `<select>` populated from `/api/agents` as `SpawnSessionModal`. Default = parent's agent (`parentSession.metadata.agent`) if present, else first in list.
   - **Intro prompt** (textarea): freeform, optional. If empty, behaves like today (bare pane, no agent launched). If non-empty, agent is launched and prompt sent post-launch.
4. On submit:
   - POST `/api/sessions/:id/sub-sessions` with body `{ agent?: string, prompt?: string }`
   - Server calls `sessionManager.createSubSession(sessionId, { agent, prompt })`
   - Modal closes immediately; `SessionTerminalTabs` re-polls and switches active tab to the new sub-session ID

**`createSubSession` contract change (core):**
```typescript
interface CreateSubSessionOptions {
  /** Agent plugin name — if set, launch agent in the new pane. If unset, bare tmux pane (legacy). */
  agent?: string;
  /** Initial prompt — if set AND agent set, sent post-launch via runtime.sendMessage(). */
  prompt?: string;
}
createSubSession(sessionId: SessionId, options?: CreateSubSessionOptions): Promise<SubSession>
```

Implementation notes:
- When `options.agent` is set: resolve plugin from registry, build launch command via `agent.getLaunchCommand({ prompt: undefined })` (post-launch delivery only — sub-sessions never use launch-time prompts to avoid quoting issues), spawn tmux runtime with that command, then if `options.prompt` is set, call `runtime.sendMessage(handle, options.prompt)`.
- When `options.agent` is unset: behave exactly as today (bare tmux pane with `launchCommand: ""`).
- `AO_SESSION_ID` env var = `subSessionId` (so the agent's hooks log to the sub-session, not the parent).
- `AO_ISSUE_ID` env var = `parentRaw["issueId"]` (inherited from parent — matches what UI shows as locked).
- Reuse existing `agent.setupWorkspaceHooks()` so PR-tracking still works for the sub-session's PRs.
- Reuse existing `recordTerminalActivity` plumbing — sub-session writes to its own activity JSONL under the sub-session metadata directory.

### Commits

**Commit 1:** `feat(core): add SubSession type and sub-session lifecycle methods`

Files to modify:
- `packages/core/src/types.ts`
  - Add `SubSession` interface (after `Session` definition, ~line 230)
  - Add `CreateSubSessionOptions` interface
  - Add 4 sub-session methods to `SessionManager` interface — `createSubSession` takes `(sessionId, options?)`
- `packages/core/src/session-manager.ts`
  - `createSubSession(sessionId, options?)`:
    - Existing path when `!options?.agent`: bare tmux pane (current gb-personal behavior, `launchCommand: ""`)
    - New path when `options.agent`: resolve plugin from `pluginRegistry`, build env (inherit parent's `AO_ISSUE_ID`), `agent.getLaunchCommand` (no prompt), spawn tmux, if `options.prompt` then `await runtime.sendMessage(handle, options.prompt)` after a short delay (200ms — matches `agent-claude-code` post-launch pattern)
    - Write metadata: `parent: sessionId`, `type: "terminal"`, `agent: options?.agent ?? ""`, `issueId: parentRaw["issueId"] ?? ""`
  - `listSubSessions`, `killSubSession`, `restoreTerminalSubSession` — copy from gb-personal source unchanged
- `packages/core/src/index.ts` — export `SubSession`, `CreateSubSessionOptions`
- `packages/core/src/__tests__/test-utils.ts` — add stub impls for all 4 methods on mock `SessionManager`
- `packages/core/src/__tests__/session-manager.test.ts`
  - Test: `createSubSession(id)` (no options) → bare pane, no agent
  - Test: `createSubSession(id, { agent: "amp" })` → tmux launches `amp`, no prompt sent
  - Test: `createSubSession(id, { agent: "amp", prompt: "hello" })` → tmux launches `amp`, `runtime.sendMessage` called with `"hello"`
  - Test: sub-session inherits `AO_ISSUE_ID` from parent metadata
  - Test: `listSubSessions` returns primary + terminals with correct `alive` flag
  - Test: `killSubSession` marks terminal dead
  - Test: `restoreTerminalSubSession` returns live SubSession

**Commit 2:** `feat(web): add sub-session REST API routes with agent + prompt body`

Files to create (copy from source, fix imports, add Zod body parsing on POST):
- `packages/web/src/app/api/sessions/[id]/sub-sessions/route.ts`
  - GET: `listSubSessions(id)` → 200; 404 if session not found
  - POST: parse JSON body with Zod `{ agent: z.string().optional(), prompt: z.string().optional() }`; call `createSubSession(id, body)` → 201
  - Helper `subSessionToJson(s)` (set `runtimeHandle: null` — not serializable)
- `packages/web/src/app/api/sessions/[id]/sub-sessions/[subId]/route.ts` — DELETE: `killSubSession(id, subId)` → 200
- `packages/web/src/app/api/sessions/[id]/sub-sessions/[subId]/restore/route.ts` — POST: `restoreTerminalSubSession(id, subId)` → 200 `{ subSession }`

Files to create:
- `packages/web/src/app/api/sessions/[id]/sub-sessions/__tests__/route.test.ts`
  - Test: POST with `{}` calls `createSubSession(id, {})`
  - Test: POST with `{ agent: "amp", prompt: "x" }` calls `createSubSession(id, { agent: "amp", prompt: "x" })`
  - Test: POST with invalid body shape returns 400

**Commit 3:** `feat(web): add SpawnSubSessionModal with locked issue ID + agent + prompt`

Files to create:
- `packages/web/src/components/SpawnSubSessionModal.tsx`
  - Props: `{ open: boolean; onClose: () => void; parentSession: DashboardSession; onSubSessionCreated?: (subId: string) => void }`
  - Fields:
    - Issue ID input — `value={parentSession.issueId ?? ""}`, `readOnly`, `disabled`-styled, lock icon + tooltip "Inherited from parent"
    - Agent `<select>` — fetches `/api/agents` on open (same pattern as `SpawnSessionModal`); default = `parentSession.metadata.agent` if present
    - Intro prompt `<textarea>` — placeholder "Optional. If empty, opens a bare terminal."
  - On submit: POST `/api/sessions/{parentSession.id}/sub-sessions` with `{ agent, prompt }` (omit empty fields)
  - Portaled via `createPortal(modal, document.body)` with SSR guard (same as `SpawnSessionModal`)
  - Escape key closes
  - 80% of this file is a thin variant of `SpawnSessionModal` from PR5 — keep them as separate files; do not generalize prematurely
- `packages/web/src/components/__tests__/SpawnSubSessionModal.test.tsx`
  - Test: issue ID input is `readOnly` and shows parent's issueId
  - Test: agent dropdown defaults to parent's `metadata.agent` if present
  - Test: submit with prompt → POST body includes `{ agent, prompt }`
  - Test: submit with empty prompt → POST body includes `{ agent }` only (no `prompt` key)
  - Test: escape closes modal
  - Test: portal renders modal in document.body

**Commit 4:** `feat(web): add SessionTerminalTabs with sub-session spawn dialog`

Files to create (copy from source, fix imports):
- `packages/web/src/components/SessionTerminalTabs.tsx`
  - **CRITICAL:** change `import { DirectTerminalGB as DirectTerminal }` → `import { DirectTerminal } from "@/components/DirectTerminal"`
  - Replace the existing direct `addTerminal()` call from "+" with `setSpawnModalOpen(true)`
  - Render `<SpawnSubSessionModal open={spawnModalOpen} parentSession={parentSession} onClose={...} onSubSessionCreated={(id) => { setActiveId(id); void loadSubs(); }} />`
  - **Drop `NewTerminalModal.tsx`** — replaced by `SpawnSubSessionModal`. Do NOT copy `NewTerminalModal` to upstream.
  - Keep `MAX_TERMINAL_SUB_SESSIONS = 5` enforcement (hide "+" when count == 5)
  - Keep `inFlight` poll guard (fix `257cd10f`)
  - Component needs `parentSession: DashboardSession` prop now (to pass to modal)
- `packages/web/src/components/workspace/sessionTerminalTabState.ts` (copy from source)
- `packages/web/src/lib/cn.ts` (if not on upstream after PR6b)

Files to modify:
- `packages/web/src/components/SessionDetail.tsx`
  - Inside `<WorkspaceLayout>`'s `terminal` slot (or, if PR6b not yet merged, the bare terminal `<div>`): replace `<DirectTerminal sessionId={...} />` with `<SessionTerminalTabs sessionId={session.id} parentSession={session} variant={terminalVariant} isOpenCodeSession={isOpenCodeSession} reloadCommand={reloadCommand} />`
  - Preserve `terminalEnded` placeholder branch — only mount `SessionTerminalTabs` when terminal is alive
  - Preserve `showTerminal` rAF guard (fix `93a71a57`)

Files to create:
- `packages/web/src/components/__tests__/SessionTerminalTabs.test.tsx`
  - Test: primary "Agent" tab rendered on load
  - Test: "+" button opens `SpawnSubSessionModal` (not direct create)
  - Test: modal submit triggers POST with `{ agent, prompt }`, then re-poll, then switch active tab
  - Test: "+" hidden when tab count is 5
  - Test: dead terminal tab has reduced opacity
  - Test: clicking dead tab triggers restore API
  - Test: `Cmd+Shift+L` advances to next tab
  - Test: `Cmd+Shift+H` goes to previous tab

### Validation

- Session detail: single "Agent" tab on fresh session
- "+" → `SpawnSubSessionModal` opens with parent's issue ID locked
- Submit with agent + prompt → "T1" tab appears focused; agent launches; prompt visible in pane
- Submit with empty prompt → "T1" appears as bare pane (no agent)
- Kill tmux session manually → tab turns faded on next 3s poll
- Click faded tab → restore fires → tab becomes active
- 5 terminals: "+" hidden
- Reload: previously active tab restored

---

## PR 8 — Sidebar Lone Terminals  <!-- new -->

**Branch:** `feat/upstream-sidebar-lone-terminals`
**Upstream base:** `main` (after PR2/PR3 merged via `feat/upstream-pr2-pr3`)
**Depends on:** PR 2 + PR 3 (sidebar layout + dashboard-app-shell from `feat/upstream-pr2-pr3`)
**Independent of:** PR 7 (sub-sessions). Lone terminals are NOT sub-sessions — they have no parent AO session.

### Concept

- A "lone terminal" is a raw tmux pane with **no parent session, no agent, no worktree** — it lives wherever the user wants (defaults to AO data dir or `$HOME`)
- Used for quick shell tasks alongside agent supervision — `gh pr list`, `git log`, manual experiments
- Listed in the **sidebar** under a new "Terminals" section, separate from project sessions
- Terminal icon distinguishes them from agent-session rows
- Persist across page reloads via flat-file metadata
- Click → full-screen `<DirectTerminal>` page at `/terminals/[name]`
- Killable from sidebar context menu

### Storage design

**Path:** `~/.agent-orchestrator/lone-terminals/{terminalId}.json`
- Flat dir of small JSON files, one per terminal — mirrors how sessions/sub-sessions are stored
- `terminalId`: short slug, user-supplied or auto-generated (e.g. `term-a3f9`)
- File contents:
  ```json
  {
    "id": "term-a3f9",
    "label": "gh-prs",
    "tmuxName": "ao-lone-term-a3f9",
    "cwd": "/home/gb",
    "createdAt": "2026-04-16T...",
    "alive": true
  }
  ```
- `alive` is recomputed on every list call by checking tmux liveness — file is the source of truth for existence + label, tmux is source of truth for liveness
- On delete: kill tmux + delete JSON file

**Why a separate dir, not a key in `agent-orchestrator.yaml`:**
- YAML is project-scoped (and Zod-validated); lone terminals are ephemeral and global to the user
- Avoids polluting per-project config with personal scratch terminals
- Symmetric with how `~/.agent-orchestrator/{hash}-{projectId}/sessions/` works

**`LoneTerminal` type (new in core):**
```typescript
// packages/core/src/types.ts
export interface LoneTerminal {
  id: string;
  label: string;
  tmuxName: string;
  cwd: string;
  createdAt: string;
  alive: boolean;
}
```

**`LoneTerminalManager` (new in core, separate from SessionManager):**
```typescript
export interface LoneTerminalManager {
  list(): Promise<LoneTerminal[]>;
  create(input: { label: string; cwd?: string }): Promise<LoneTerminal>;
  kill(id: string): Promise<void>;
  restore(id: string): Promise<LoneTerminal>;
  get(id: string): Promise<LoneTerminal | null>;
}
```

Implementation:
- Uses the same tmux runtime plugin as sessions, but with `launchCommand: ""` (raw shell)
- `tmuxName: "ao-lone-${id}"` — `ao-lone-` prefix prevents collision with session tmux names
- `cwd` defaults to `os.homedir()` if not supplied
- File location: `path.join(os.homedir(), ".agent-orchestrator", "lone-terminals")`

### API routes (new)

- `GET /api/lone-terminals` → `{ terminals: LoneTerminal[] }`
- `POST /api/lone-terminals` body `{ label: string; cwd?: string }` → 201 `{ terminal }`
- `DELETE /api/lone-terminals/[id]` → 200
- `POST /api/lone-terminals/[id]/restore` → 200 `{ terminal }`
- All routes validate `id` matches `^[a-z0-9-]{4,32}$` to prevent path traversal in JSON file lookup

### Sidebar integration

- New section in `ProjectSidebar.tsx`, **below** the projects list, **above** filter toggles
- Header: "Terminals" + "+" button (opens `NewLoneTerminalModal`)
- Each terminal row: terminal icon (square `<svg>` distinct from agent icon) + label + status dot (green = alive, gray = dead)
- Click row → `router.push("/terminals/" + encodeURIComponent(id))`
- Hover → 3-dot context menu → Restore (if dead) / Kill (if alive) / Delete
- Empty state: small "No terminals yet" muted text
- Polling: piggyback on existing sidebar 5s polling — add `fetch("/api/lone-terminals")` alongside `fetch("/api/sessions")`

### Full-screen terminal page

- Route: `app/terminals/[name]/page.tsx` (no nested route group; matches PR2/PR3 layout pattern)
- Renders the same chrome as `SessionDetail` (header + ProjectSidebar) but with lone-terminal-specific topbar (label, kill button, no PR/branch)
- Body: `<DirectTerminal sessionId={tmuxName} variant="agent" height="100%" />` — terminal WS multiplexes by tmux name, so passing `tmuxName` works
- Title: `terminal | ${label}`

### Components needed

- `packages/web/src/components/NewLoneTerminalModal.tsx` — simple form: `label` (required), `cwd` (optional, defaults to `~`); submit POSTs to `/api/lone-terminals`
- `packages/web/src/components/LoneTerminalRow.tsx` — sidebar row component
- `packages/web/src/components/LoneTerminalDetail.tsx` — full-screen page chrome (header + DirectTerminal)
- `packages/web/src/lib/lone-terminal.ts` — client-side fetch helpers + types

### Commits

**Commit 1:** `feat(core): add LoneTerminal type and LoneTerminalManager`

Files to create:
- `packages/core/src/lone-terminal-manager.ts` — full implementation as described above; uses `runtime` plugin from registry; file I/O under `~/.agent-orchestrator/lone-terminals/`
- `packages/core/src/__tests__/lone-terminal-manager.test.ts` — list/create/kill/restore happy paths + invalid id rejection

Files to modify:
- `packages/core/src/types.ts` — add `LoneTerminal` interface, `LoneTerminalManager` interface
- `packages/core/src/index.ts` — export both types and the manager factory

**Commit 2:** `feat(web): add lone-terminals API routes`

Files to create (with id-validation regex on every dynamic route):
- `packages/web/src/app/api/lone-terminals/route.ts` — GET, POST
- `packages/web/src/app/api/lone-terminals/[id]/route.ts` — DELETE
- `packages/web/src/app/api/lone-terminals/[id]/restore/route.ts` — POST
- `packages/web/src/app/api/lone-terminals/__tests__/route.test.ts` — body validation, success path, 400 on invalid id

Files to modify:
- `packages/web/src/lib/services.ts` — instantiate `LoneTerminalManager` alongside `SessionManager`, expose via `getServices()`

**Commit 3:** `feat(web): add lone terminal sidebar section + new-terminal modal`

Files to create:
- `packages/web/src/components/NewLoneTerminalModal.tsx`
- `packages/web/src/components/LoneTerminalRow.tsx`
- `packages/web/src/components/__tests__/LoneTerminalRow.test.tsx` — render label, status dot, click navigates, context menu actions call API

Files to modify:
- `packages/web/src/components/ProjectSidebar.tsx`
  - Add `loneTerminals?: LoneTerminal[]` prop
  - Render new "Terminals" section between projects list and filter toggles
  - Hidden if `loneTerminals?.length === 0` and "+" button keeps it discoverable
- `packages/web/src/components/Dashboard.tsx`
  - Fetch `/api/lone-terminals` in the same effect that fetches projects/sessions
  - Pass `loneTerminals` down to `<ProjectSidebar>`
- `packages/web/src/components/SessionDetail.tsx`
  - Same: pass `loneTerminals` down to its `<ProjectSidebar>` instance
- `packages/web/src/app/globals.css`
  - Add `.sidebar-lone-terminal-row`, `.sidebar-section-divider` styles consistent with existing `.sidebar-project-row` styles

**Commit 4:** `feat(web): add full-screen lone terminal page at /terminals/[name]`

Files to create:
- `packages/web/src/app/terminals/[name]/page.tsx` — server component that resolves the lone terminal, returns `notFound()` if missing, renders `<LoneTerminalDetail>`
- `packages/web/src/components/LoneTerminalDetail.tsx` — copies the PR2/PR3 chrome pattern from SessionDetail (header + ProjectSidebar + main with `<DirectTerminal>`); kill button calls `DELETE /api/lone-terminals/[id]` then redirects to `/`
- `packages/web/src/components/__tests__/LoneTerminalDetail.test.tsx`

### Validation

- Sidebar: "Terminals" section visible; "+" button opens modal
- Submit modal → row appears in sidebar with terminal icon + green status dot
- Click row → navigate to `/terminals/{id}` → full-screen DirectTerminal connects to tmux
- Type `whoami` in terminal → output appears
- Reload page → terminal persists (still in sidebar, still alive)
- Sidebar context menu → Kill → row turns gray (dead), tmux session ends
- Context menu → Restore → row green again, new tmux session attached
- Context menu → Delete → row vanishes, JSON file deleted
- Lone terminals don't appear in any project's session list

---

## Sequencing

```
PR1  (amp plugin)            ← no deps
PR2  (terminal layout)       ← merged via feat/upstream-pr2-pr3
PR3  (topbar/sidebar)        ← merged via feat/upstream-pr2-pr3
PR4  (configurable prompt)   ← no deps, parallel with PR1
PR5  (new session UI)        ← no deps (agent dropdown is dynamic)
PR6a (file/diff API)         ← no deps
PR6b (workspace UI)          ← after PR6a + PR2 (terminal height already merged)
PR7  (sub-sessions)          ← after PR5 (SpawnSubSessionModal extends SpawnSessionModal pattern) + PR6b (swaps DirectTerminal inside WorkspaceLayout's terminal slot)
PR8  (lone terminals)        ← after PR2/PR3 sidebar layout (already merged); independent of PR6/PR7
```

- PR2 + PR3 are already merged via `feat/upstream-pr2-pr3`
- PRs 1, 4, 5, 6a, 8 can all be opened in parallel against `main`
- PR6b waits for PR6a
- PR7 waits for PR5 + PR6b (so sub-session tabs land inside the workspace's terminal pane)
