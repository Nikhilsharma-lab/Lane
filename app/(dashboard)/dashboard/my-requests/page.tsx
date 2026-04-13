export default function MyRequestsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">My requests</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Requests where you&apos;re the designer owner.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          You&apos;re clear. Time to think, learn, or help a teammate.
        </p>
      </div>
    </div>
  );
}
