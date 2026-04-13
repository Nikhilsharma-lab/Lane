export default function SavedPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Saved</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Streams and views you&apos;ve bookmarked.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. Bookmark streams to find them quickly later.
        </p>
      </div>
    </div>
  );
}
