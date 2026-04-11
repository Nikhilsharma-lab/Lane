export default function InboxPage() {
  return (
    <div style={{ padding: "var(--space-6)" }}>
      <h1 className="text-[22px] font-bold text-foreground">Inbox</h1>
      <p className="text-[13px] text-muted-foreground/60 mt-2">
        Notifications and updates will appear here.
      </p>
      <div
        className="mt-10 text-center text-[13px] text-muted-foreground/60 border border-dashed rounded-xl px-6 py-12"
      >
        All clear. Nothing needs your attention right now.
      </div>
    </div>
  );
}
