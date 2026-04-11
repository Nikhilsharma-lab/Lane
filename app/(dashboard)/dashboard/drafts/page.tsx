export default function DraftsPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 className="text-[22px] font-bold text-foreground">Drafts</h1>
      <p className="text-[13px] text-muted-foreground/60 mt-2">
        Requests you started but haven&apos;t submitted yet.
      </p>
      <div
        className="mt-10 text-center text-[13px] text-muted-foreground/60 border border-dashed rounded-xl px-6 py-12"
      >
        No drafts. Start a new request when you&apos;re ready.
      </div>
    </div>
  );
}
