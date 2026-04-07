"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { type DashboardSession } from "@/lib/types";
import { createStubSession } from "@/lib/stub-session";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import { FileTree } from "@/components/workspace/FileTree";
import { FilePreview } from "@/components/workspace/FilePreview";
import { DiffViewer } from "@/components/workspace/DiffViewer";
import { DirectTerminal } from "@/components/DirectTerminal";
import { isOrchestratorSession } from "@composio/ao-core/types";

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const projectId = searchParams.get("project") ?? "";

  const [session, setSession] = useState<DashboardSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
      if (res.status === 404) {
        setError("Session not found");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DashboardSession;
      setSession(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch session:", err);
      setError("Failed to load session");
    }
  }, [id]);

  // Initial fetch
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Poll for updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSession();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchSession]);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "var(--color-status-error)", fontSize: "14px" }}>{error}</div>
      </div>
    );
  }

  const displaySession = session ?? createStubSession(id, projectId);
  const isOrchestrator = session ? isOrchestratorSession(session) : false;

  return (
    <WorkspaceLayout session={displaySession}>
      {{
        fileTree: (file, { showChangedOnly, onFileSelected }) => (
          <FileTree
            sessionId={id}
            selectedFile={file}
            showChangedOnly={showChangedOnly}
            onFileSelected={onFileSelected}
          />
        ),
        preview: (file, { diffMode }) =>
          diffMode ? (
            <DiffViewer sessionId={id} selectedFile={file} />
          ) : (
            <FilePreview sessionId={id} selectedFile={file} />
          ),
        terminal: (
          <DirectTerminal
            sessionId={id}
            variant={isOrchestrator ? "orchestrator" : "agent"}
            height="100%"
            headerLabel="TERMINAL"
            isOpenCodeSession={displaySession.metadata["agent"] === "opencode"}
            reloadCommand={
              displaySession.metadata["agent"] === "opencode" && displaySession.metadata["opencodeSessionId"]
                ? `/exit\nopencode --session ${displaySession.metadata["opencodeSessionId"]}\n`
                : undefined
            }
          />
        ),
      }}
    </WorkspaceLayout>
  );
}
