import { cn } from "@/lib/utils"

function ListSkeleton() {
  return (
    <aside className="flex min-w-0 flex-1 flex-col bg-card lg:w-[360px] lg:flex-none lg:border-r xl:w-[400px]">
      <header className="shrink-0 border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-28 rounded bg-muted" />
            <div className="mt-2 h-3 w-14 rounded bg-muted" />
          </div>
          <div className="h-touch-target w-11 rounded-lg bg-muted sm:h-control-utility sm:w-28" />
        </div>
        <div className="mt-4 h-touch-target w-full rounded-lg bg-muted sm:h-control-utility sm:w-[156px]" />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden py-3">
        {[0, 1, 2].map((group) => (
          <div key={group} className="pb-4">
            <div className="mx-4 mb-2 h-4 w-24 rounded bg-muted" />
            <div className="divide-y border-y">
              {[0, 1].map((row) => (
                <div
                  key={row}
                  className="flex min-h-[88px] items-start gap-3 px-4 py-3"
                >
                  <div className="mt-2 size-2 shrink-0 rounded-full bg-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-4/5 rounded bg-muted" />
                    <div className="mt-2 h-3 w-2/3 rounded bg-muted" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
                  </div>
                  <div className="mt-1 h-4 w-4 shrink-0 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function DetailSkeleton() {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="size-control-product rounded-lg bg-muted" />
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-[760px] px-5 py-6 sm:px-8 sm:py-8">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="mt-3 h-7 w-4/5 rounded bg-muted" />
          <div className="mt-3 h-7 w-3/5 rounded bg-muted" />
          {[0, 1, 2].map((section) => (
            <div key={section} className="mt-8 border-t pt-8">
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="mt-4 h-4 w-full rounded bg-muted" />
              <div className="mt-2 h-4 w-3/4 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      <footer className="shrink-0 border-t bg-card px-4 py-3">
        <div className="mx-auto h-16 max-w-[760px] rounded-lg bg-muted" />
      </footer>
    </section>
  )
}

export function RequestsWorkspaceLoading({
  selected = false,
}: {
  selected?: boolean
}) {
  return (
    <main
      aria-hidden="true"
      className="flex min-h-0 flex-1 animate-pulse bg-background lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden xl:h-screen"
    >
      <div className={cn("flex min-w-0 flex-1", selected && "hidden lg:flex")}>
        <ListSkeleton />
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          selected ? "flex" : "hidden lg:flex"
        )}
      >
        <DetailSkeleton />
      </div>
    </main>
  )
}
