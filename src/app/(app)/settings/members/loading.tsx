import { LoadingRegion } from "@/components/ui/loading-region";

export default function MembersLoading() {
  return (
    <LoadingRegion
      label="Loading Members"
      className="flex flex-1 flex-col"
    >
      {/* Header bar */}
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <div className="h-4 w-12 rounded bg-muted" />
        <div className="h-4 w-px bg-muted" />
        <div className="h-5 w-20 rounded bg-muted" />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Invite form placeholder */}
        <div className="mb-8">
          <div className="mb-3 h-4 w-32 rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-control-form-touch flex-1 rounded-md border bg-muted/30 sm:h-control-form" />
            <div className="h-control-form-touch w-24 rounded-md border bg-muted/30 sm:h-control-form" />
            <div className="h-touch-target w-16 rounded-md bg-muted sm:h-control-utility" />
          </div>
        </div>

        {/* Members list */}
        <div className="mb-8">
          <div className="mb-3 h-4 w-28 rounded bg-muted" />
          <div className="divide-y border-y">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex min-h-row-identity-touch items-center gap-3 px-2 py-2.5 sm:min-h-row-identity">
                <div className="size-8 shrink-0 rounded-lg bg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 h-4 w-28 rounded bg-muted" />
                  <div className="h-3 w-40 rounded bg-muted/60" />
                </div>
                <div className="flex w-32 shrink-0 items-center justify-end gap-1">
                  <div className="h-7 w-[92px] rounded-md bg-muted/60" />
                  <div className="size-7 rounded-md bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </LoadingRegion>
  );
}
