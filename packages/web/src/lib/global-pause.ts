// Self-contained web-local global pause — inlines the constants that were
// removed from @aoagents/ao-core when the core revert happened (PR #908).
// This file intentionally does not import from core to stay build-clean.

const GLOBAL_PAUSE_UNTIL_KEY = "globalPauseUntil";
const GLOBAL_PAUSE_REASON_KEY = "globalPauseReason";
const GLOBAL_PAUSE_SOURCE_KEY = "globalPauseSource";

function parsePauseUntil(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isOrchestratorSession(
  session: { id: string; projectId: string; metadata: Record<string, string> },
  sessionPrefix: string,
  _allSessionPrefixes: string[],
): boolean {
  // Orchestrator sessions have a role=orchestrator in metadata
  return session.metadata["role"] === "orchestrator" || session.id.startsWith(`${sessionPrefix}-orch`);
}

export interface GlobalPauseState {
  pausedUntil: string;
  reason: string;
  sourceSessionId: string | null;
}

export function resolveGlobalPause(
  sessions: Array<{ id: string; projectId: string; metadata: Record<string, string> }>,
  projects: Record<string, { sessionPrefix?: string }>,
): GlobalPauseState | null {
  const allSessionPrefixes = Object.entries(projects).map(
    ([projectId, p]) => p.sessionPrefix ?? projectId,
  );
  let best: { pausedUntil: string; reason: string; sourceSessionId: string | null } | null = null;
  for (const session of sessions) {
    const sessionPrefix = projects[session.projectId]?.sessionPrefix ?? session.projectId;
    if (!isOrchestratorSession(session, sessionPrefix, allSessionPrefixes)) continue;
    const parsed = parsePauseUntil(session.metadata[GLOBAL_PAUSE_UNTIL_KEY]);
    if (!parsed || parsed.getTime() <= Date.now()) continue;

    if (!best || parsed.getTime() > new Date(best.pausedUntil).getTime()) {
      best = {
        pausedUntil: parsed.toISOString(),
        reason: session.metadata[GLOBAL_PAUSE_REASON_KEY] ?? "Model rate limit reached",
        sourceSessionId: session.metadata[GLOBAL_PAUSE_SOURCE_KEY] ?? null,
      };
    }
  }

  return best;
}
