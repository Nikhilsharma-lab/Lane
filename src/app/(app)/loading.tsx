export default function AppLoading() {
  return (
    <div className="flex-1 px-6 py-8 animate-pulse" aria-hidden="true">
      <div className="mb-8 flex items-center justify-between">
        <div className="h-8 w-36 rounded bg-muted" />
        <div className="h-8 w-28 rounded-lg bg-muted" />
      </div>
      <div className="space-y-10">
        {[0, 1, 2].map((section) => (
          <div key={section}>
            <div className="mb-3 h-4 w-24 rounded bg-muted" />
            <div className="divide-y overflow-hidden rounded-xl border">
              {[0, 1].map((row) => (
                <div key={row} className="px-4 py-3.5">
                  <div className="h-4 w-2/5 rounded bg-muted" />
                  <div className="mt-2 h-3 w-3/4 rounded bg-muted/70" />
                  <div className="mt-2.5 h-3 w-28 rounded bg-muted/50" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
