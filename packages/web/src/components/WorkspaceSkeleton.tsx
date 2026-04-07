"use client";

export default function WorkspaceSkeleton() {
  return (
    <div className="flex h-screen w-full flex-col bg-[var(--color-bg-primary)]">
      {/* Top bar skeleton */}
      <div
        className="h-12 w-full animate-pulse border-b border-[var(--color-border)]"
        style={{ background: "var(--color-bg-hover)" }}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column - file tree skeleton (~20%) */}
        <div className="w-1/5 border-r border-[var(--color-border)] p-4">
          <div
            className="mb-4 h-3 w-24 animate-pulse rounded"
            style={{ background: "var(--color-bg-hover)" }}
          />
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="mb-3 flex items-center gap-2"
            >
              <div
                className="h-3 animate-pulse rounded"
                style={{
                  background: "var(--color-bg-hover)",
                  width: `${60 + (i % 3) * 20}%`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Middle area - preview skeleton (~50%) */}
        <div className="flex-1 border-r border-[var(--color-border)] p-4">
          <div
            className="mb-4 h-3 w-32 animate-pulse rounded"
            style={{ background: "var(--color-bg-hover)" }}
          />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="mb-2 h-3 animate-pulse rounded"
              style={{
                background: "var(--color-bg-hover)",
                width: `${80 + (i % 4) * 10}%`,
              }}
            />
          ))}
        </div>

        {/* Right/bottom area - terminal skeleton */}
        <div className="w-1/4 border-l border-[var(--color-border)]" style={{ background: "var(--color-bg-terminal, #1a1a1a)" }}>
          <div
            className="h-full w-full animate-pulse"
            style={{ background: "var(--color-bg-hover)" }}
          />
        </div>
      </div>
    </div>
  );
}
