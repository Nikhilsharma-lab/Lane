import type { ReactNode } from "react"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

export const FEEDBACK_KINDS = [
  "error",
  "success",
  "warning",
  "info",
  "loading",
] as const

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

const feedbackStyles: Record<
  FeedbackKind,
  {
    icon: LucideIcon
    panel: string
    inline: string
    iconColor: string
    iconSurface: string
  }
> = {
  error: {
    icon: CircleAlertIcon,
    panel: "border-destructive-border bg-destructive-soft",
    inline: "text-destructive",
    iconColor: "text-destructive",
    iconSurface: "bg-destructive-icon",
  },
  success: {
    icon: CircleCheckIcon,
    panel: "border-success-border bg-success-soft",
    inline: "text-foreground",
    iconColor: "text-success",
    iconSurface: "bg-success-icon",
  },
  warning: {
    icon: TriangleAlertIcon,
    panel: "border-warning-border bg-warning-soft",
    inline: "text-foreground",
    iconColor: "text-warning",
    iconSurface: "bg-warning-icon",
  },
  info: {
    icon: InfoIcon,
    panel: "border-info-border bg-info-soft",
    inline: "text-foreground",
    iconColor: "text-info",
    iconSurface: "bg-info-icon",
  },
  loading: {
    icon: LoaderCircleIcon,
    panel: "border-info-border bg-info-soft",
    inline: "text-foreground",
    iconColor: "text-info",
    iconSurface: "bg-info-icon",
  },
}

export function Feedback({
  kind,
  title,
  children,
  variant = "panel",
}: {
  kind: FeedbackKind
  title?: ReactNode
  children: ReactNode
  variant?: "panel" | "inline"
}) {
  const config = feedbackStyles[kind]
  const Icon = config.icon
  const panel = variant === "panel"

  return (
    <div
      data-slot="feedback"
      data-kind={kind}
      data-variant={variant}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "flex items-center text-type-support",
        panel
          ? "min-h-[58px] gap-3 rounded-lg border px-3.5 py-3 text-foreground"
          : "gap-2",
        panel ? config.panel : config.inline
      )}
    >
      <span
        data-slot="feedback-icon"
        className={cn(
          "flex shrink-0 items-center justify-center",
          panel ? "size-8 rounded-md" : "size-[18px]",
          panel && config.iconSurface,
          config.iconColor
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            panel ? "size-[18px]" : "size-4",
            kind === "loading" &&
              "motion-safe:animate-spin motion-reduce:animate-none"
          )}
          strokeWidth={1.8}
        />
      </span>
      <span className={cn("min-w-0", title && "space-y-1")}>
        {title && (
          <span className="block font-semibold text-foreground">{title}</span>
        )}
        <span
          className={cn(
            "block",
            panel && title && "text-muted-foreground"
          )}
        >
          {children}
        </span>
      </span>
    </div>
  )
}
