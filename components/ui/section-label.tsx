import { cn } from "@/lib/utils"

function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="section-label"
      className={cn(
        "text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1.5",
        className
      )}
      {...props}
    />
  )
}

export { SectionLabel }
