# Feature Plan: Collapse Toggle in Diff Viewer

**Issue:** collapse-toggle-finally
**Branch:** `feat/collapse-toggle-finally`
**Status:** Pending

---

## Problem

- Users viewing git diffs see all hunk content expanded by default, making it hard to see the overall structure of changes
- No way to collapse/expand the entire diff file at once (only overall, not per-hunk)
- Need a toggle button in the preview pane header to collapse/uncollapse the diff when in diff mode
- Collapsed state should persist per session (using sessionStorage)

## Research

### Preview Header Structure

- **File:** `packages/web/src/components/workspace/WorkspaceLayout.tsx:453-494`
- The preview pane header shows "PREVIEW" title with a search button on the right (line 472-483)
- Current right-side button: `<button onClick={() => setQuickOpenVisible(true)}>`

### DiffViewer Component

- **File:** `packages/web/src/components/workspace/DiffViewer.tsx:52-141`
- Renders diff hunks via `buildHunks()` function (line 106)
- Each hunk has a header and lines array (`DiffHunk` type from `diffParse.ts`)
- Renders all hunks and lines unconditionally - no collapse state

### Diff Data Types

- **File:** `packages/web/src/components/workspace/diffParse.ts`
- `DiffHunk` interface: `{ header: string, lines: DiffLine[] }`
- `DiffLine` types: "added", "removed", "context"

## Approach

### Fix 1: Add persistence with sessionStorage

- Use sessionStorage (existing `sessionFileState.ts` pattern line 24)
- Store `diffCollapsed` boolean per session, load on mount, save on toggle

**Files to reference:**

- **File:** `packages/web/src/components/workspace/sessionFileState.ts:21-49`
- Uses `window.sessionStorage.getItem(getStorageKey(sessionId))`

### Fix 2: Add toggle button in preview header

- In `WorkspaceLayout.tsx` preview pane header (line 472-483), add toggle button left of search button
- Only show when `diffMode` is true
- Button toggles `diffCollapsed` state with persistence

### Fix 3: Pass collapsed state to DiffViewer

- Modify `children.preview()` call to pass `diffCollapsed` option
- Update `WorkspaceLayoutProps` interface to include in opts

### Fix 4: Modify DiffViewer to respect collapsed state

- In `DiffViewer.tsx`, accept `collapsed` prop
- When collapsed: show only hunk headers, hide lines
- When expanded: show full diff (current behavior)

## Files to Modify

| File                                                        | Change                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `packages/web/src/components/workspace/WorkspaceLayout.tsx` | Add diffCollapsed state, pass to preview render function |
| `packages/web/src/components/workspace/DiffViewer.tsx`      | Add collapsed prop, collapse hunk content when collapsed |

## Risks / Open Questions

| #   | Question                            | Notes                                                |
| --- | ----------------------------------- | ---------------------------------------------------- |
| 1   | Persist collapsed state per session | Use existing `sessionFileState` localStorage pattern |
| 2   | Only overall collapse/uncollapse    | Not per-hunk - entire diff at once                   |
| 3   | Collapsed state only for diff mode  | Regular file preview always shows full content       |

## Validation

- Manual test: Open workspace, enable diff mode, click toggle - hunks should collapse/expand
- Regression: Regular file preview (non-diff mode) still works with search button

## Checklist

### Phase 1 — Storage Helpers

- [ ] **1.1** Add `loadDiffCollapsed(sessionId)` to `sessionFileState.ts`
- [ ] **1.2** Add `saveDiffCollapsed(sessionId, collapsed: boolean)` to `sessionFileState.ts`

### Phase 2 — State in WorkspaceLayout

- [ ] **2.1** Load `diffCollapsed` from storage on mount in `WorkspaceLayout.tsx`
- [ ] **2.2** Add state `diffCollapsed`, set from loaded value
- [ ] **2.3** Pass `diffCollapsed` in `children.preview()` opts
- [ ] **2.4** Save to storage when toggled

### Phase 3 — Toggle Button

- [ ] **3.1** Add toggle button in preview header (left of search button, line 472)
- [ ] **3.2** Conditionally render only when `diffMode` is true
- [ ] **3.3** Use chevron icon (down when expanded, right when collapsed)

### Phase 4 — DiffViewer Update

- [ ] **4.1** Add `collapsed?: boolean` prop to `DiffViewerProps` interface
- [ ] **4.2** When collapsed: render hunk headers only, skip lines
- [ ] **4.3** When expanded: render full diff (current behavior)

### Phase 5 — Tests

- [ ] **5.1** pnpm build
- [ ] **5.2** pnpm typecheck
- [ ] **5.3** pnpm lint
