export default function BettingBoardPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Betting Board</h1>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8 }}>
        Decide which shaped requests to bet on each cycle.
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
        Coming soon. The betting board will let design heads decide what to bet on per cycle.
      </div>
    </div>
  );
}
