export default function DraftsPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Drafts</h1>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8 }}>
        Requests you started but haven&apos;t submitted yet.
      </p>
      <div
        style={{
          marginTop: 40,
          padding: "48px 24px",
          textAlign: "center",
          borderRadius: 12,
          border: "1px dashed var(--border)",
          color: "var(--text-tertiary)",
          fontSize: 13,
        }}
      >
        No drafts. Start a new request when you&apos;re ready.
      </div>
    </div>
  );
}
