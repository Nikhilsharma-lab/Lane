import { Avatar } from "@base-ui/react/avatar"
import { MailIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { identityInitials, identityTone, type IdentityTone } from "@/lib/identity"

const TONE_CLASSES: Record<IdentityTone, string> = {
  raspberry: "bg-identity-raspberry text-identity-ink",
  persimmon: "bg-identity-persimmon text-identity-ink",
  chartreuse: "bg-identity-chartreuse text-identity-ink",
}

type IdentityMarkProps = {
  label: string | null | undefined
  kind?: "person" | "workspace" | "invite" | "unknown"
  src?: string | null
  unread?: boolean
  className?: string
}

export function IdentityMark({
  label,
  kind = "person",
  src,
  unread = false,
  className,
}: IdentityMarkProps) {
  const unknown = kind === "unknown" || !label?.trim()
  const tone = identityTone(label)
  const fallback =
    kind === "workspace"
      ? Array.from(label?.trim() ?? "")[0]?.toLocaleUpperCase()
      : identityInitials(label)
  const fallbackContent = unknown ? (
    "?"
  ) : kind === "invite" ? (
    <MailIcon className="size-4" strokeWidth={1.8} />
  ) : (
    fallback || "?"
  )
  const fallbackClassName =
    "flex size-full items-center justify-center rounded-lg"

  return (
    <Avatar.Root
      aria-hidden="true"
      data-slot="identity-mark"
      data-kind={unknown ? "unknown" : kind}
      data-tone={unknown ? "neutral" : tone}
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center overflow-visible rounded-lg font-mono text-xs leading-[17px] font-semibold",
        unknown ? "bg-muted text-muted-foreground" : TONE_CLASSES[tone],
        className
      )}
    >
      {src ? (
        <>
          <Avatar.Image
            src={src}
            alt=""
            className="size-full rounded-lg object-cover"
          />
          <Avatar.Fallback delay={0} className={fallbackClassName}>
            {fallbackContent}
          </Avatar.Fallback>
        </>
      ) : (
        <span className={fallbackClassName}>{fallbackContent}</span>
      )}
      {unread && (
        <span
          data-slot="identity-unread"
          className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-card bg-focus"
        />
      )}
    </Avatar.Root>
  )
}
