export default function MembersLoading() {
  return (
    <div className="flex flex-1 flex-col animate-pulse">
      {/* Header bar */}
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <div className="h-4 w-12 rounded bg-muted" />
        <div className="h-4 w-px bg-muted" />
        <div className="h-5 w-20 rounded bg-muted" />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {/* Invite form placeholder */}
        <div className="mb-8">
          <div className="mb-3 h-4 w-32 rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-9 flex-1 rounded-md border bg-muted/30" />
            <div className="h-9 w-24 rounded-md border bg-muted/30" />
            <div className="h-9 w-16 rounded-md bg-muted" />
          </div>
        </div>

        {/* Members list */}
        <div className="mb-8">
          <div className="mb-3 h-4 w-28 rounded bg-muted" />
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <div className="mb-1.5 h-4 w-28 rounded bg-muted" />
                  <div className="h-3 w-40 rounded bg-muted/60" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-16 rounded-full bg-muted/60" />
                  <div className="h-5 w-16 rounded-full bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
