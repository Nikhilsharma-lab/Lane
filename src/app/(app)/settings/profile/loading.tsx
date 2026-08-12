import { LoadingRegion } from "@/components/ui/loading-region"

function SettingsCardSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="space-y-2 border-b border-border px-5 py-4">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="h-4 w-64 max-w-full rounded bg-muted" />
      </div>
      <div className="space-y-5 p-5">
        {Array.from({ length: rows }).map((_, item) => (
          <div key={item} className="space-y-2">
            <div className="h-[18px] w-20 rounded bg-muted" />
            <div className="h-control-form-touch w-full rounded-lg border border-border bg-card sm:h-control-form sm:w-72" />
            <div className="h-4 w-full max-w-[420px] rounded bg-muted" />
          </div>
        ))}
        <div className="h-touch-target w-28 rounded-lg bg-muted sm:h-control-product" />
      </div>
    </section>
  )
}

export default function ProfileLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="h-7 w-24 rounded bg-muted" />
      </header>
      <div className="flex min-h-touch-target items-center gap-5 border-b border-border px-5 sm:px-7">
        <div className="h-4 w-14 rounded bg-muted" />
        <div className="h-4 w-16 rounded bg-muted" />
      </div>

      <LoadingRegion
        label="Loading Profile settings"
        className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-8"
      >
        <SettingsCardSkeleton />
        <SettingsCardSkeleton />
      </LoadingRegion>
    </div>
  )
}
