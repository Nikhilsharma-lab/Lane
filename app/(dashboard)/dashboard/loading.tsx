import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between h-12 px-5 shrink-0">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-48" />
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden gap-4 px-4 pb-4">
        {/* Main content */}
        <div className="flex-1 space-y-6 py-2">
          {/* Morning briefing skeleton */}
          <Skeleton className="h-24 w-full rounded-xl" />

          {/* Focus sections */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-6 rounded" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        {/* Right panel */}
        <aside className="hidden lg:flex w-[260px] shrink-0">
          <Skeleton className="h-full w-full rounded-xl" />
        </aside>
      </div>
    </>
  );
}
