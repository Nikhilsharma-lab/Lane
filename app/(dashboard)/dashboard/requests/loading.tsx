import { Skeleton } from "@/components/ui/skeleton";

export default function RequestsLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 h-[52px] px-5 shrink-0 border-b bg-card">
        <Skeleton className="h-4 w-16" />
        <div className="flex items-center gap-1 flex-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-7 w-28 rounded-md" />
        <Skeleton className="h-7 w-16 rounded-md" />
      </div>

      {/* List header */}
      <div className="grid grid-cols-[80px_1fr_120px_140px_70px] gap-3 px-5 py-2 border-b bg-muted">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-12" />
        ))}
      </div>

      {/* List rows */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[80px_1fr_120px_140px_70px] gap-3 px-5 py-3 border-b"
        >
          <Skeleton className="h-3 w-14" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}
