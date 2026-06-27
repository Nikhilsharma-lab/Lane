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
