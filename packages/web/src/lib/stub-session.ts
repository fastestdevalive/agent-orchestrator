import type { DashboardSession } from "@/lib/types";

export function createStubSession(id: string, projectId: string): DashboardSession {
  return {
    id,
    projectId,
    status: "working",
    activity: null,
    branch: null,
    issueId: null,
    issueUrl: null,
    issueLabel: null,
    issueTitle: null,
    summary: null,
    summaryIsFallback: false,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    pr: null,
    metadata: {},
  };
}
