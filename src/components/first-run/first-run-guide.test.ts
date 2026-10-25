import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))

import { FirstRunGuideView, type FirstRunGuideViewProps } from "./first-run-guide-view"
import { FirstRunInviteForm } from "./first-run-invite-form"

const noop = () => {}
const free = { planState: "free" as const, free: { total: 4, used: 0, left: 4, usedElsewhere: null } }
const base: FirstRunGuideViewProps = {
  view: { guide: "first_request", step: "framing", read: [], filed: false },
  step: "framing", workspaceName: "Studio", free, readsNeedsYou: true, placement: "list",
  onStep: noop, onSkip: noop, onFinish: noop, onOpenInbox: noop, onFile: noop,
}
const render = (props: Partial<FirstRunGuideViewProps> = {}) => renderToStaticMarkup(createElement(FirstRunGuideView, { ...base, ...props }))
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

describe("the first Request guide (#217)", () => {
  it("is a named region that walks through the loop one step at a time, starting with the problem framing", () => {
    const html = render()
    expect(html).toMatch(/<section[^>]*aria-labelledby="first-run-heading"[^>]*data-first-run="first_request"/)
    expect(html).toMatch(/<h2[^>]*id="first-run-heading"[^>]*>File your first Request<\/h2>/)
    expect(html).toContain('aria-label="Step 1 of 5: Start with the problem"')
    expect(html).toMatch(/<h3[^>]*>Start with the problem<\/h3>/)
    expect(text(html)).toContain("Lane checks the framing")
    expect(html).not.toContain(">Back<")
    expect(html).toContain(">Next step<")
  })

  it("offers filing the first Request at every step, and skipping the guide", () => {
    for (const step of ["framing", "prediction", "reviewers", "free_requests", "release"] as const) {
      const html = render({ step })
      expect(html.match(/<a [^>]*href="\/intake"[^>]*>/g)).toHaveLength(1)
      expect(html).toContain(">File your first Request</a>")
      expect(html).toContain(">Skip the guide<")
    }
  })

  it("explains the prediction from the Metrics library, with a way to it", () => {
    const html = render({ step: "prediction" })
    expect(html).toContain('aria-label="Step 2 of 5: Predict the result"')
    expect(text(html)).toContain("Pick the metric you expect to move from the Metrics library")
    expect(html).toMatch(/<a [^>]*href="\/settings\/metrics"[^>]*>Open the Metrics library<\/a>/)
    expect(html).toContain(">Back<")
  })

  it("explains Reviewers, and gives an Admin the invite form there", () => {
    const form = createElement("form", { "data-invite-slot": "" })
    const html = render({ step: "reviewers", inviteForm: form })
    expect(text(html)).toContain("Reviewers are optional")
    expect(text(html)).toContain("Looks good or Raise a concern")
    expect(text(html)).toContain("never hold up pickup")
    expect(html).toContain("data-invite-slot")
    expect(text(render({ step: "reviewers" }))).toContain("Ask an Admin to invite teammates")
  })

  it("shows the Free Requests left", () => {
    expect(text(render({ step: "free_requests" }))).toContain("4 of 4 Free Requests left.")
    const used = { planState: "free" as const, free: { total: 0, used: 0, left: 0, usedElsewhere: { kind: "company_domain" as const, domain: "example.com" } } }
    expect(text(render({ step: "free_requests", free: used }))).toContain("The Free Requests for example.com were already used by another workspace.")
  })

  it("explains Release and Result due, and that Lane brings them back when the result is due", () => {
    const html = render({ step: "release" })
    expect(html).toContain('aria-label="Step 5 of 5: Release and Result due"')
    expect(text(html)).toContain("record the Release")
    expect(text(html)).toContain("Result due")
    expect(text(html)).toContain("Lane brings you back")
    expect(html).not.toContain(">Next step<")
  })

  it("leaves filing to the page's own button on New Request", () => {
    const html = render({ placement: "intake" })
    expect(html).not.toContain('href="/intake"')
    expect(html).toContain(">Skip the guide<")
  })

  it("once the first Request is filed, shows the Free Requests left and what happens next", () => {
    const html = render({ view: { guide: "first_request", step: "release", read: [], filed: true }, free: { planState: "free", free: { total: 4, used: 1, left: 3, usedElsewhere: null } } })
    expect(html).toMatch(/<h2[^>]*>Your first Request is filed<\/h2>/)
    expect(text(html)).toContain("3 of 4 Free Requests left.")
    expect(text(html)).toContain("Lane brings you back")
    expect(html).toContain(">Finish the guide<")
    expect(html).not.toContain('href="/intake"')
    expect(html).not.toContain("Step 1 of 5")
  })

  it("lets someone who already filed read the steps again, about filing any Request", () => {
    const filed = { guide: "first_request" as const, step: "framing" as const, read: [], filed: true }
    expect(render({ view: filed })).toContain(">See the steps again<")
    const html = render({ view: filed, showSteps: true })
    expect(html).toMatch(/<h2[^>]*>How a Request goes<\/h2>/)
    expect(html).toContain(">File a Request</a>")
    expect(html).toContain(">Finish the guide<")
    expect(html).not.toContain(">Skip the guide<")
  })

  it("says in place when skipping or finishing didn't save, and keeps the guide", () => {
    const html = render({ error: "Your first run isn't ready yet. Reload the page and try again." })
    expect(html).toMatch(/role="alert"[\s\S]*Reload the page and try again\./)
    expect(html).toContain(">Skip the guide<")
  })

  it("keeps a long workspace name whole", () => {
    const html = render({ view: { guide: "joined" }, workspaceName: "A workspace with a very long name that keeps going well past the width of a phone" })
    expect(html).toContain("A workspace with a very long name")
  })
})

describe("the short first run for people who join later", () => {
  it("shows a Member their Inbox and what Needs you means", () => {
    const html = render({ view: { guide: "joined" } })
    expect(html).toMatch(/<section[^>]*data-first-run="joined"/)
    expect(html).toMatch(/<h2[^>]*>Welcome to Studio<\/h2>/)
    expect(text(html)).toContain("Needs you")
    expect(html).toMatch(/<a [^>]*href="\/inbox"[^>]*>Open your Inbox<\/a>/)
    expect(html).toContain(">Skip<")
    expect(html).not.toContain('href="/intake"')
  })

  it("tells a Guest or Viewer their Inbox holds updates, with no Needs you", () => {
    const html = render({ view: { guide: "joined" }, readsNeedsYou: false })
    expect(text(html)).not.toContain("Needs you")
    expect(text(html)).toContain("updates on the Requests you can see")
  })
})

describe("inviting teammates from the first run", () => {
  const form = (roles: ("member" | "viewer")[]) => renderToStaticMarkup(createElement(FirstRunInviteForm, { roles, onInvite: async () => ({ success: true as const }) }))

  it("invites a teammate as a Reviewer (a Member)", () => {
    const html = form(["member"])
    expect(html).toMatch(/<form[^>]*aria-labelledby="first-run-invite-heading"/)
    expect(html).toContain(">Invite teammates<")
    expect(html).toContain(">Email address<")
    expect(html).toContain(">Reviewer<")
    expect(text(html)).toContain("Once they join, you can pick them as Reviewers.")
    expect(html).toContain(">Send invitation<")
    expect(html).not.toContain(">Viewer<")
  })

  it("offers Viewer too once Viewers are available", () => {
    const html = form(["member", "viewer"])
    expect(html).toContain(">Reviewer<")
    expect(html).toContain(">Viewer<")
    expect(text(html)).toContain("Free. Reads everything")
  })
})
