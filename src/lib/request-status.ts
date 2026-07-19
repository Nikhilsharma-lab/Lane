export function statusLabel(status: string): string {
  switch (status) {
    case "open": return "Open";
    case "in_progress": return "In Progress";
    case "done": return "Done";
    default: return status;
  }
}

export function statusVariant(status: string) {
  switch (status) {
    case "open": return "secondary" as const;
    case "in_progress": return "default" as const;
    case "done": return "outline" as const;
    default: return "secondary" as const;
  }
}

export function statusDotClass(status: string): string {
  switch (status) {
    case "open":
      return "bg-muted-foreground"
    case "in_progress":
      return "bg-persimmon"
    case "done":
      return "bg-chartreuse"
    default:
      return "bg-muted-foreground"
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "open":
      return "border-border bg-card text-foreground"
    case "in_progress":
      return "border-warning-border bg-warning-soft text-foreground"
    case "done":
      return "border-success-border bg-success-soft text-foreground"
    default:
      return "border-border bg-card text-foreground"
  }
}
