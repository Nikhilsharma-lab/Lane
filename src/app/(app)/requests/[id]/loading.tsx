export default function RequestDetailLoading() {
  return (
    <div className="flex flex-1 flex-col animate-pulse">
      {/* Header bar */}
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <div className="h-4 w-12 rounded bg-muted" />
        <div className="h-4 w-px bg-muted" />
        <div className="h-5 w-48 rounded bg-muted" />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        {/* Status + actions row */}
        <div className="mb-6 flex items-center justify-between">
          <div className="h-5 w-20 rounded-full bg-muted" />
          <div className="h-8 w-24 rounded bg-muted" />
        </div>

        {/* Description card */}
        <div className="mb-6 rounded-lg border p-6">
          <div className="mb-3 h-3 w-32 rounded bg-muted" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted/60" />
            <div className="h-3 w-4/5 rounded bg-muted/60" />
            <div className="h-3 w-3/5 rounded bg-muted/60" />
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-2">
          <div className="h-3 w-48 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>

        {/* Separator + comments */}
        <div className="my-8 h-px bg-border" />
        <div className="h-4 w-24 rounded bg-muted mb-4" />
        <div className="rounded-lg border p-4">
          <div className="h-20 rounded bg-muted/30" />
        </div>
      </main>
    </div>
  );
}
