export default function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--color-bg-terminal, #1a1a1a)" }}>
      <span style={{ color: "var(--color-text-tertiary)", fontSize: "13px", fontFamily: "monospace" }}>Connecting…</span>
    </div>
  );
}
