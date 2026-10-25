import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ReviewerInviteHint } from "./reviewer-invite-hint"

const hint = (canInvite: boolean) => renderToStaticMarkup(createElement(ReviewerInviteHint, { canInvite }))
const text = (html: string) => html.replace(/<[^>]+>/g, "")

describe("ReviewerInviteHint (#211)", () => {
  it("tells a Member that only Admins and Members can review, and to ask an admin to invite anyone else", () => {
    const html = hint(false)
    expect(text(html)).toBe("Only Admins and Members can review. Not listed? Ask an admin to invite them.")
    expect(html).not.toContain("<a")
  })

  it("points an Admin to Members settings to invite them", () => {
    const html = hint(true)
    expect(text(html)).toBe("Only Admins and Members can review. Not listed? Invite them as a Member.")
    expect(html).toContain('href="/settings/members"')
  })
})
