export default function InboxPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Inbox</h1>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8 }}>
        Notifications and updates will appear here.
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
        All clear. Nothing needs your attention right now.
      </div>
    </div>
  );
}
