# Sub-Session Concept

Companion to `upstream-to-main-plan.md` PR 7. Keep the visuals, skip the prose.

---

## What is a sub-session?

- A **session** owns: one worktree, one issue ID, one agent pane, one eventual PR
- A **sub-session** is an extra tmux pane inside the same worktree — no separate worktree, no separate issue
- Two flavors:
  - `primary` — the agent's own pane, always present, ID = parent session ID
  - `terminal` — extra panes added on demand, ID = `${parentId}-t${n}`
- Cap: **5 terminal sub-sessions per parent** (`MAX_TERMINAL_SUB_SESSIONS`)
- Single-level only — no sub-sessions of sub-sessions (enforced in `session-manager.ts`)

---

## Hierarchy

```
                           AO project
                               │
    ┌──────────────────────────┼──────────────────────────┐
    │                          │                          │
Session ao-123           Session ao-124            Session ao-125
(worktree A, issue #45)  (worktree B, issue #46)   (worktree C, issue #47)
    │                          │                          │
┌───┴───┐                  ┌───┴───┐                      │
│       │                  │       │                      │
primary  t1              primary   t1                  primary
(agent) (shell)          (agent)  (shell)              (agent)
  │       │                │        │                     │
tmux:   tmux:            tmux:    tmux:                 tmux:
ao-123  ao-123-t1        ao-124   ao-124-t1             ao-125

(t1 shares the same worktree dir — `git status` sees agent edits live)
```

---

## Storage layout

```
~/.agent-orchestrator/{hash}-{projectId}/
├── sessions/
│   ├── ao-123          ← primary session (key=value)
│   │   ├── worktree=...
│   │   ├── issueId=45
│   │   ├── tmuxName=ao-123
│   │   └── ...
│   ├── ao-123-t1       ← terminal sub-session
│   │   ├── parent=ao-123
│   │   ├── type=terminal
│   │   ├── worktree=... (same as parent)
│   │   ├── issueId=45  (inherited)
│   │   ├── agent=amp   (only set when launched with an agent)
│   │   └── tmuxName=ao-123-t1
│   └── ao-123-t2
└── worktrees/
    └── ao-123/         ← single worktree shared by ao-123, -t1, -t2
```

- `listSubSessions(parentId)` — reads `sessions/` dir, filters by `parent=parentId`, prepends a synthetic `primary` entry, checks tmux liveness for each

---

## Lifecycle

```
          create                     (tmux dies)
        (modal submit)                    │
              │                           ▼
              ▼                     ┌──────────┐
        ┌──────────┐  observed      │          │
        │          │ ────────────▶  │   DEAD   │
        │  ALIVE   │                │          │
        │          │ ◀──────────    └────┬─────┘
        └────┬─────┘  restore            │
             │        (POST restore)     │ auto-prune
             │ kill                      │ (client, after 1 poll)
             ▼ (DELETE)                  ▼
        metadata removed           metadata removed
```

- **ALIVE** — tmux session exists, tab normal opacity
- **DEAD** — tmux gone, tab faded (60% opacity); if it's not the active tab, auto-pruned after next 3s poll
- **RESTORE** — click faded tab → `POST .../restore` → fresh tmux session, same name, empty scrollback
- **Auto-prune guard** — `creatingRef.current` prevents pruning a pane that's just been created but hasn't had its first tmux heartbeat yet

---

## Spawn flow

### Old (gb-personal)

```
Click "+"
    │
    ▼
POST /sub-sessions  {}
    │
    ▼
bare tmux pane, user manually runs agent + types prompt
```

### New (PR 7)

```
Click "+"
    │
    ▼
┌─────────────────────────────────────────┐
│  SpawnSubSessionModal                   │
│  Issue ID:  [ ao-123      ] 🔒          │  ← locked, inherited from parent
│  Agent:     [ claude-code     ▼]        │  ← defaults to parent's agent
│  Intro prompt:                          │
│  ┌─────────────────────────────────┐    │
│  │ Investigate failing CI...       │    │  ← optional
│  └─────────────────────────────────┘    │
│              [ Cancel ]  [ Spawn ]      │
└─────────────────────────────────────────┘
    │ submit
    ▼
POST /sub-sessions  { agent, prompt }
    │
    ▼
createSubSession(id, { agent, prompt })
  1. resolve agent plugin from registry
  2. build env (inherit AO_ISSUE_ID)
  3. agent.getLaunchCommand()
  4. runtime.create(tmux, launchCommand)
  5. setupWorkspaceHooks
  6. if (prompt) runtime.sendMessage(handle, prompt)
    │
    ▼
Tab "T1" focused, agent running, prompt sent
```

### Input behavior matrix

| User input      | Server behavior                                              |
|-----------------|--------------------------------------------------------------|
| agent + prompt  | Spawn agent, send prompt post-launch                         |
| agent only      | Spawn agent, sits idle waiting for input                     |
| prompt only     | Rejected client-side (prompt textarea grayed out, no agent)  |
| neither         | Bare tmux pane — legacy gb-personal behavior                 |

### Why issue ID is locked
- Hooks log activity against the issue — wrong ID = mis-linked events
- PRs created from the pane would mis-link
- Dashboard project grouping would mis-attribute
- Want a different issue? Spawn a top-level session instead

### Agent default rationale
- Defaults to parent's agent (`parentSession.metadata.agent`)
- Override available (e.g. parent = `claude-code`, sub = `amp` for a quick alternative)

---

## Workspace layout integration

```
┌─────────────────────────────────────────────────────────────────┐
│ <header className="dashboard-app-header">                       │
│   hamburger  brand  project  status  branch  …  PR  Kill        │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ ProjectSide- │  <main className="session-detail-page">          │
│ bar          │   ┌───────────────────────────────────────────┐  │
│              │   │ <WorkspaceLayout> (PR6b)                  │  │
│ • project A  │   │  ┌──────┬──────────┬────────────────────┐ │  │
│   - ao-123   │   │  │ file │ preview  │  tab strip         │ │  │
│   - ao-124   │   │  │ tree │ / diff   │  Agent | T1  [+]   │ │  │
│ • project B  │   │  │      │          │  ┌──────────────┐  │ │  │
│              │   │  │      │          │  │ DirectTerminal│  │ │  │
│ Terminals    │   │  │      │          │  │ (active subId)│  │ │  │
│ (PR 8)       │   │  │      │          │  └──────────────┘  │ │  │
│ • term-a3f9  │   │  └──────┴──────────┴────────────────────┘ │  │
│ • term-7b21  │   └───────────────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────────────┘
```

- PR 6b: puts 3-pane WorkspaceLayout inside `<main>`; terminal slot = bare `<DirectTerminal>`
- PR 7: swaps terminal slot → `<SessionTerminalTabs>` (tab strip + active tab's DirectTerminal)
- PR 8: "Terminals" section in `<ProjectSidebar>` — **unrelated to sub-sessions**, no parent session

---

## Type contract

```typescript
interface SubSession {
  id: string;
  parentId: SessionId;
  type: "primary" | "terminal";
  tmuxName: string;
  workspacePath: string;
  runtimeHandle: RuntimeHandle | null;
  alive: boolean;
}

interface CreateSubSessionOptions {
  agent?: string;   // plugin name; omit for bare pane
  prompt?: string;  // post-launch message; only sent if agent is set
}

// SessionManager additions
createSubSession(sessionId: SessionId, options?: CreateSubSessionOptions): Promise<SubSession>
listSubSessions(sessionId: SessionId): Promise<SubSession[]>
killSubSession(sessionId: SessionId, subSessionId: string): Promise<void>
restoreTerminalSubSession(parentSessionId: SessionId, subSessionId: SessionId): Promise<SubSession>
```

```http
POST /api/sessions/:id/sub-sessions
{ "agent": "claude-code", "prompt": "investigate failing tests" }

→ 201 { "subSession": { "id": "ao-123-t1", "parentId": "ao-123", ... } }
```
