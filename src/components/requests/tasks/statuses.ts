import { CircleDashed, CircleDot, CircleCheck } from "lucide-react"

export const statuses = [
  { value: "open", label: "Open", icon: CircleDashed, colorClassName: "text-muted-foreground", tone: "neutral" },
  { value: "in_progress", label: "In Progress", icon: CircleDot, colorClassName: "text-[var(--accent)]", tone: "info" },
  { value: "done", label: "Done", icon: CircleCheck, colorClassName: "text-[var(--success)]", tone: "success" },
] as const
