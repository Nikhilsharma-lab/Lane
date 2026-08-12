import { LoadingRegion } from "@/components/ui/loading-region"

function FieldSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="h-[18px] w-28 rounded bg-muted" />
      <div
        className={
          tall
            ? "h-32 rounded-lg border border-border bg-card"
            : "h-control-form-touch rounded-lg border border-border bg-card sm:h-control-form"
        }
      />
      <div className="h-3 w-48 max-w-full rounded bg-muted" />
    </div>
  )
}

export default function IntakeLoading() {
  return (
    <main className="mx-auto w-full max-w-[1088px] px-4 py-6 sm:px-6 sm:py-8">
      <LoadingRegion label="Loading Intake" className="space-y-6">
        <header className="space-y-4">
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="flex min-w-0 flex-1 items-center gap-2 last:flex-none"
              >
                <div className="size-6 shrink-0 rounded-full border border-border bg-card" />
                <div className="hidden h-3 w-16 rounded bg-muted sm:block" />
                {item < 2 && <div className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-8 w-72 max-w-full rounded-md bg-muted" />
            <div className="h-5 w-full max-w-[520px] rounded bg-muted" />
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,660px)_minmax(280px,1fr)]">
          <section className="space-y-5 rounded-xl border border-border bg-card p-5">
            <FieldSkeleton />
            <FieldSkeleton tall />
            <div className="flex justify-end pt-1">
              <div className="h-control-form-touch w-32 rounded-lg bg-muted sm:h-control-form" />
            </div>
          </section>

          <aside className="space-y-5 rounded-xl border border-border bg-card p-5">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-5 w-48 max-w-full rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
            </div>
            <div className="divide-y divide-border border-y border-border">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex min-h-12 items-center gap-3 py-2.5"
                >
                  <div className="size-5 shrink-0 rounded bg-muted" />
                  <div className="h-4 flex-1 rounded bg-muted" />
                  <div className="h-3 w-14 rounded bg-muted" />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </LoadingRegion>
    </main>
  )
}
