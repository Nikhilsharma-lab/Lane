export default function ImpactPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Impact</h1>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8 }}>
        Predicted vs. actual impact across shipped work.
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
        Coming soon. Track how predictions compare to real outcomes.
      </div>
    </div>
  );
}
