import { createElement, type SVGProps } from "react"
import { StatusGlyph } from "../status-glyph"
import { statusLabel } from "@/lib/request-status"

const iconFor = (status: "open" | "in_progress" | "done") =>
  function StatusIcon(props: SVGProps<SVGSVGElement>) { return createElement(StatusGlyph, { ...props, status }) }

export const statuses = [
  { value: "open", label: statusLabel("open"), icon: iconFor("open"), tone: "neutral" },
  { value: "in_progress", label: statusLabel("in_progress"), icon: iconFor("in_progress"), tone: "warning" },
  { value: "done", label: statusLabel("done"), icon: iconFor("done"), tone: "success" },
] as const
