"use client"

import type { ReactNode } from "react"

/**
 * The open Request's title, `#request-title`: arrival, Mark Done and the composer move focus to it.
 *
 * The id goes on the heading React has put on the page, never into the server's HTML. React shows a streamed part
 * of a page by moving it out of a hidden holder on the next frame, and a tab in the background draws no frames. If
 * the frame around the page changes before then (the composer's code arriving, say), React draws the Request itself
 * and the streamed copy waits in its holder, hidden, until a frame comes. With the id in the HTML, that copy was a
 * second `#request-title` meanwhile.
 */
export function RequestTitle({ as: Heading, className, children }: { as: "h1" | "h2"; className: string; children: ReactNode }) {
  return <Heading ref={takeTitleId} tabIndex={-1} className={className}>{children}</Heading>
}

function takeTitleId(heading: HTMLHeadingElement | null) {
  heading?.setAttribute("id", "request-title")
}
