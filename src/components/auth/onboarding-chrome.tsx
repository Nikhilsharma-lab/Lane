import type { ReactNode } from "react"
import { LoaderCircleIcon } from "lucide-react"

import { LaneMark } from "@/components/auth/auth-shell"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/utils"

export function OnboardingChrome({
  current,
  total,
  children,
  wide = false,
}: {
  current?: number
  total?: number
  children: ReactNode
  wide?: boolean
}) {
  const progressKnown =
    typeof current === "number" && typeof total === "number"

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6 sm:px-8">
        <LaneMark />
        {progressKnown ? (
          <div
            className="flex items-center gap-3"
            aria-label={`Step ${current} of ${total}`}
          >
            <span className="font-mono text-type-meta text-muted-foreground">
              {current} of {total}
            </span>
            <span className="hidden h-0.5 w-[72px] overflow-hidden bg-border sm:block">
              <span
                className="block h-full bg-brand transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${(current / total) * 100}%` }}
              />
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-type-meta text-muted-foreground">
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
              strokeWidth={1.8}
            />
            <span>Preparing setup…</span>
          </div>
        )}
      </header>
      <span className="h-0.5 w-full overflow-hidden bg-border sm:hidden">
        {progressKnown && (
          <span
            className="block h-full bg-brand transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${(current / total) * 100}%` }}
          />
        )}
      </span>

      <main className="flex min-h-0 flex-1 justify-center px-6 pb-10 pt-10 sm:items-center sm:px-8 sm:pb-20 sm:pt-12">
        <div className={cn("w-full", wide ? "max-w-[430px]" : "max-w-[420px]")}>
          {children}
        </div>
      </main>
    </div>
  )
}

export function StepHeading({
  title,
  description,
}: {
  title: string
  description: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Typography as="h1" role="authTitle">
        {title}
      </Typography>
      <Typography
        as="div"
        role="ui"
        className="max-w-[400px] text-pretty text-muted-foreground"
      >
        {description}
      </Typography>
    </div>
  )
}
