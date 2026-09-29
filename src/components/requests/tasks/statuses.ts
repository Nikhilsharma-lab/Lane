// Official Tasks example status configuration adapted to Lane's lifecycle.
import { Circle, Timer, CheckCircle } from "lucide-react"
export const statuses = [
  { value: "open", label: "Open", icon: Circle },
  { value: "in_progress", label: "In Progress", icon: Timer },
  { value: "done", label: "Done", icon: CheckCircle },
]
