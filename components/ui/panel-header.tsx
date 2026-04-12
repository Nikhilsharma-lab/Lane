import { cn } from "@/lib/utils"

function PanelHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex items-center justify-between border-b bg-muted px-5 py-3",
        className
      )}
      {...props}
    />
  )
}

export { PanelHeader }
