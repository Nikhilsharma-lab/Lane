import { createElement, type ComponentProps, type MouseEvent as ReactMouseEvent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { withoutHidden } from "@/test/exposed-markup"
import { forgetConfirmations, renderedConfirmations } from "@/test/inline-confirmation"
import type { Confirmation } from "./workspace-rows-state"
import { LeaveWorkspaceRow, type LeaveWorkspaceRowProps } from "./leave-workspace-row"

vi.mock("@/components/popup/permanent-action-confirmation", () => import("@/test/inline-confirmation"))
// No DOM here: the test drives the confirmation the row made, the way pressing Leave workspace would.
const row = vi.hoisted(() => ({ leave: undefined as Confirmation | undefined }))
vi.mock("./workspace-rows-state", async importOriginal => {
  const actual = await importOriginal<typeof import("./workspace-rows-state")>()
  return { ...actual, createConfirmation: () => row.leave ??= actual.createConfirmation() }
})
// The links the row rendered, so the test can click one.
const links = vi.hoisted(() => [] as ComponentProps<"a">[])
vi.mock("@/components/link", async importOriginal => {
  const { default: Link } = await importOriginal<typeof import("@/components/link")>()
  return { default: (props: ComponentProps<typeof Link>) => { links.push(props as ComponentProps<"a">); return createElement(Link, props) } }
})
const leave = () => { if (!row.leave) throw new Error("The row made no confirmation."); return row.leave }
const confirmation = () => { const last = renderedConfirmations().at(-1); if (!last) throw new Error("No confirmation rendered."); return last }

const ONLY_ADMIN = "You’re the only Admin. Make someone else an Admin before you leave."
const left = async () => ({ ok: true as const })
const base: LeaveWorkspaceRowProps = { workspaceName: "Acme Design", onlyAdmin: false, peopleList: "/settings/profile?section=members#people", onPeopleList: () => {}, onLeave: left }
const render = (props: Partial<LeaveWorkspaceRowProps> = {}) => renderToStaticMarkup(createElement(LeaveWorkspaceRow, { ...base, ...props }))
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const leaveButton = (html: string) => /<button[^>]*>(?:<[^>]+>)*Leave workspace/.exec(html)?.[0] ?? ""
const settle = () => new Promise(resolve => setTimeout(resolve))

describe("Settings → Leave the workspace (#381)", () => {
  beforeEach(() => {
    row.leave = undefined
    forgetConfirmations()
  })

  it("offers Leave <workspace> with a red Leave workspace, and says what leaving does", () => {
    const html = render()
    expect(html).toMatch(/<strong[^>]*>Leave Acme Design<\/strong>/)
    expect(leaveButton(html)).toMatch(/_danger_/)
    expect(leaveButton(html)).not.toMatch(/\bdisabled=""/)
    expect(text(html)).toContain("You lose access straight away. Your Requests and comments stay.")
    expect(text(html)).not.toContain(ONLY_ADMIN)
    expect(html).not.toContain('role="dialog"')
  })

  it("is the row settings search lands on (#395)", () => {
    expect(render()).toMatch(/<div id="leave-workspace" tabindex="-1"/)
  })

  it("asks first in #346's words, and leaves once confirmed", async () => {
    const onLeave = vi.fn(left)
    render({ onLeave })
    leave().ask()
    const html = render({ onLeave })
    expect(html).toContain('role="dialog" aria-label="Leave Acme Design?"')
    expect(text(html)).toContain("You lose access straight away. Your Requests and comments stay. An Admin can invite you again.")
    expect(confirmation().confirmLabel).toBe("Leave workspace")
    expect(onLeave).not.toHaveBeenCalled()
    confirmation().onConfirm()
    await settle()
    expect(onLeave).toHaveBeenCalledOnce()
    expect(render({ onLeave })).not.toContain('role="dialog"')
  })

  it("closes on Cancel without leaving", () => {
    const onLeave = vi.fn(left)
    render({ onLeave })
    leave().ask()
    render({ onLeave })
    confirmation().onOpenChange(false)
    expect(render({ onLeave })).not.toContain('role="dialog"')
    expect(onLeave).not.toHaveBeenCalled()
  })

  it("greys Leave for the only Admin, says why, and links to the People list", () => {
    const html = render({ onlyAdmin: true })
    const button = leaveButton(html)
    expect(button).toMatch(/\bdisabled=""/)
    const reason = /aria-describedby="([^"]+)"/.exec(button)?.[1]
    expect(reason).toBeTruthy()
    expect(text(new RegExp(`<span id="${reason}"[^>]*>.*?</span>`).exec(html)?.[0] ?? "")).toBe(`${ONLY_ADMIN} Make someone an Admin`)
    expect(html).toMatch(/<a [^>]*href="\/settings\/profile\?section=members#people"[^>]*>Make someone an Admin<\/a>/)
    expect(text(html)).not.toContain("Your Requests and comments stay.")
  })

  it("shows the People list from its link, and leaves a click that opens a new tab to the browser", () => {
    const onPeopleList = vi.fn<() => void>()
    render({ onlyAdmin: true, onPeopleList })
    const click = (keys: Partial<MouseEvent> = {}) => {
      const preventDefault = vi.fn()
      links.at(-1)?.onClick?.({ button: 0, preventDefault, ...keys } as unknown as ReactMouseEvent<HTMLAnchorElement>)
      return preventDefault.mock.calls.length
    }
    expect([click(), onPeopleList.mock.calls.length]).toEqual([1, 1])
    for (const keys of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) expect([keys, click(keys)]).toEqual([keys, 0])
    expect(onPeopleList).toHaveBeenCalledOnce()
  })

  it("shows the only-Admin sentence when the server refuses, for Lane's code and both of Better Auth's", async () => {
    for (const code of ["ONLY_ADMIN", "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER", "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER"]) {
      row.leave = undefined
      expect([code, Object.hasOwn(AUTH_ERROR_COPY, code)]).toEqual([code, true])
      const onLeave = async () => ({ ok: false as const, code })
      render({ onLeave })
      leave().ask()
      render({ onLeave })
      confirmation().onConfirm()
      await settle()
      const html = render({ onLeave })
      expect(html).toContain('role="dialog"')
      expect([code, text(withoutHidden(html))]).toEqual([code, expect.stringContaining(ONLY_ADMIN)])
      expect(html).toMatch(/role="alert"/)
      expect(html).not.toMatch(/owner/i)
    }
  })

  it("holds the dialog while leaving, and sends one request however often confirm is pressed", async () => {
    let answer: (value: { ok: true }) => void = () => {}
    const onLeave = vi.fn(() => new Promise<{ ok: true }>(resolve => { answer = resolve }))
    render({ onLeave })
    leave().ask()
    render({ onLeave })
    confirmation().onConfirm()
    render({ onLeave })
    expect(confirmation().busy).toBe(true)
    confirmation().onConfirm()
    answer({ ok: true })
    await settle()
    expect(onLeave).toHaveBeenCalledOnce()
  })
})
