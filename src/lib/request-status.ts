export function statusLabel(status: string): string {
  switch (status) {
    case "open": return "Open";
    case "in_progress": return "In Progress";
    case "done": return "Done";
    default: return status;
  }
}
