export default function ImpactPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }} className="text-foreground">Impact</h1>
      <p style={{ fontSize: 13, marginTop: 8 }} className="text-muted-foreground/60">
        Predicted vs. actual impact across shipped work.
      </p>
      <div
        style={{
          marginTop: 40,
          padding: "48px 24px",
          textAlign: "center",
          borderRadius: 12,
          fontSize: 13,
        }}
        className="border border-dashed text-muted-foreground/60"
      >
        Coming soon. Track how predictions compare to real outcomes.
      </div>
    </div>
  );
}
