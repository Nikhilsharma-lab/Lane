import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function LoadingRegion({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <div
      data-slot="loading-region"
      role="status"
      aria-label={label}
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "animate-pulse motion-reduce:animate-none",
        className
      )}
    >
      {children}
    </div>
  )
}
