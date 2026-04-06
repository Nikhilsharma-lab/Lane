export default function JourneyViewPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Journey View</h1>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8 }}>
        See every request&apos;s path from intake to impact.
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
        Coming soon. Journey view will visualise the full lifecycle of requests.
      </div>
    </div>
  );
}
