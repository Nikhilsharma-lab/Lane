import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const calloutVariants = cva(
  "rounded-lg border px-3 py-2 text-xs",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-muted-foreground",
        success:
          "border-accent-success/20 bg-accent-success/5 text-accent-success",
        warning:
          "border-accent-warning/20 bg-accent-warning/5 text-accent-warning",
        error:
          "border-accent-danger/20 bg-accent-danger/10 text-accent-danger",
        info: "border-accent-info/20 bg-accent-info/5 text-accent-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Callout({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof calloutVariants>) {
  return (
    <div
      data-slot="callout"
      className={cn(calloutVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Callout, calloutVariants }
