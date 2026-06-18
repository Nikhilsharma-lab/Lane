export default function AppLoading() {
  return (
    <div className="flex-1 px-6 py-6 animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-7 w-32 rounded bg-muted" />
        <div className="h-7 w-28 rounded bg-muted" />
      </div>
      <div className="space-y-8">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="mb-3 h-4 w-24 rounded bg-muted" />
            <div className="space-y-2">
              <div className="h-24 rounded-lg border bg-muted/30" />
              <div className="h-24 rounded-lg border bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
