# Feature Plan: Instant UI on Session/Terminal Click (fix-link-opening)

**Issue:** fix-link-opening
**Branch:** `feat/fix-link-opening`
**Status:** Pending

---

## Problem

Clicking a session or terminal in the sidebar leaves the UI frozen — the old page stays visible until the new page is fully ready. The user expects instant visual feedback: URL updates, something shows immediately, content loads after.

## Root Cause

No `loading.tsx` files exist in the route tree. Without them, Next.js App Router holds the current page until the destination finishes rendering, making the UI appear stuck. With `loading.tsx` present, Next.js updates the URL instantly and shows the loading UI while the page loads.

Secondary: the workspace page (`/sessions/[id]/workspace`) blocks on a fetch before rendering anything (unlike its sibling `/sessions/[id]` which renders immediately using a stub session).

---

## Fix

### 1. Add `loading.tsx` to each route segment (3 files)

These show instantly on navigation while the real page loads.

- `(with-sidebar)/sessions/[id]/loading.tsx` — three-pane workspace skeleton
- `(with-sidebar)/sessions/[id]/workspace/loading.tsx` — same skeleton (shared component)
- `(with-sidebar)/terminals/[name]/loading.tsx` — dark background + "Connecting…"

Use `animate-pulse` blocks matching the existing `SidebarSkeleton` style (`ProjectSidebar.tsx` lines 111–151).

### 2. Fix workspace page to render immediately

`sessions/[id]/workspace/page.tsx` shows a blank "Loading workspace…" (lines 54–59) while waiting for the API. Its sibling `sessions/[id]/page.tsx` already solves this with a stub session (lines 41–72). Apply the same:

- Extract `createStubSession` from `sessions/[id]/page.tsx` into `lib/stub-session.ts`
- In workspace page: remove the `if (loading)` block, add `useSearchParams` for `projectId`, render `session ?? createStubSession(id, projectId)` immediately

---

## Files

| File | Action |
|------|--------|
| `app/(with-sidebar)/sessions/[id]/loading.tsx` | Create |
| `app/(with-sidebar)/sessions/[id]/workspace/loading.tsx` | Create |
| `app/(with-sidebar)/terminals/[name]/loading.tsx` | Create |
| `lib/stub-session.ts` | Create — shared `createStubSession` |
| `app/(with-sidebar)/sessions/[id]/page.tsx` | Modify — import stub from shared util |
| `app/(with-sidebar)/sessions/[id]/workspace/page.tsx` | Modify — remove loading block, use stub |

All paths under `packages/web/src/`.

---

## Checklist

- [ ] Create `WorkspaceSkeleton` component (three-pane, `animate-pulse`)
- [ ] `sessions/[id]/loading.tsx` using `WorkspaceSkeleton`
- [ ] `sessions/[id]/workspace/loading.tsx` using `WorkspaceSkeleton`
- [ ] `terminals/[name]/loading.tsx` (dark bg, "Connecting…" text)
- [ ] Create `lib/stub-session.ts`, export `createStubSession`
- [ ] Update `sessions/[id]/page.tsx` to import from shared util
- [ ] Update `sessions/[id]/workspace/page.tsx`: remove `if (loading)`, add `useSearchParams`, use stub
- [ ] Verify: clicking any sidebar item updates URL instantly and shows skeleton
- [ ] Verify: workspace page shows layout immediately on navigation
- [ ] `pnpm build && pnpm typecheck && pnpm lint`
- [ ] Open PR against `gb-personal`
