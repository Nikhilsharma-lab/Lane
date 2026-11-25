import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WORKSPACE_ROLES } from "@/lib/role-rules"
import { withoutHidden } from "@/test/exposed-markup"
import type { WorkspaceNameDraft } from "./workspace-rows-state"
import { WorkspaceNameRow, type WorkspaceNameRowProps } from "./workspace-name-row"

// No DOM here: the test drives the draft the row made, the way typing and Save would.
const row = vi.hoisted(() => ({ draft: undefined as WorkspaceNameDraft | undefined }))
vi.mock("./workspace-rows-state", async importOriginal => {
  const actual = await importOriginal<typeof import("./workspace-rows-state")>()
  return { ...actual, createWorkspaceNameDraft: (name: string) => row.draft ??= actual.createWorkspaceNameDraft(name) }
})
const draft = () => { if (!row.draft) throw new Error("The row made no draft."); return row.draft }

const saved = async () => ({ ok: true as const })
const base: WorkspaceNameRowProps = { name: "Acme Design", role: "admin", onRename: saved }
const render = (props: Partial<WorkspaceNameRowProps> = {}) => renderToStaticMarkup(createElement(WorkspaceNameRow, { ...base, ...props }))
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const saveButton = (html: string) => /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0] ?? ""

describe("Settings → workspace name (#381)", () => {
  beforeEach(() => { row.draft = undefined })

  it("gives an Admin the name in a field with Save, disabled while the name is unchanged", () => {
    const html = render()
    expect(html).toMatch(/<form[^>]*noValidate=""/)
    expect(html).toMatch(/<label[^>]*>Workspace name<\/label>/)
    expect(html).toMatch(/<input[^>]*value="Acme Design"/)
    expect(text(html)).toContain("Everyone in the workspace sees it.")
    expect(saveButton(html)).toMatch(/\bdisabled=""/)
    expect(text(html)).not.toContain("Only Admins can change it.")
  })

  it("enables Save once the name changes, and disables it again while the name is empty or only spaces", () => {
    render()
    draft().type("Acme Studio")
    expect(saveButton(render())).not.toMatch(/\bdisabled=""/)
    for (const empty of ["", "   "]) {
      draft().type(empty)
      expect(saveButton(render())).toMatch(/\bdisabled=""/)
    }
    // The same name with spaces around it is still unchanged.
    draft().type("  Acme Design ")
    expect(saveButton(render())).toMatch(/\bdisabled=""/)
  })

  it("renames with the new name, trimmed, and treats it as the saved name afterwards", async () => {
    const onRename = vi.fn(saved)
    render({ onRename })
    draft().type("  Acme Studio ")
    expect(await draft().save(onRename)).toBe(true)
    expect(onRename).toHaveBeenCalledExactlyOnceWith("Acme Studio")
    const html = render({ onRename })
    expect(html).toMatch(/<input[^>]*value="Acme Studio"/)
    expect(saveButton(html)).toMatch(/\bdisabled=""/)
  })

  it("shows a refused rename's line on the field, and keeps what was typed", async () => {
    const onRename = async () => ({ ok: false as const, code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION" })
    render({ onRename })
    draft().type("Acme Studio")
    expect(await draft().save(onRename)).toBe(false)
    const html = render({ onRename })
    expect(html).toMatch(/<input[^>]*aria-invalid="true"/)
    expect(text(withoutHidden(html))).toContain("Only an Admin can rename the workspace. Ask an Admin of this workspace to rename it.")
    expect(html).toMatch(/<input[^>]*value="Acme Studio"/)
  })

  it("says on the field why a name can't be used, and sends nothing", async () => {
    const rename = vi.fn()
    render()
    for (const [name, line] of [["n".repeat(101), "Use at most 100 characters."], ["Acme\u2028Design", "Use one line of plain text."]]) {
      draft().type(name)
      expect(await draft().save(rename)).toBe(false)
      expect(draft().get()).toMatchObject({ value: name, error: line })
    }
    expect(rename).not.toHaveBeenCalled()
  })

  it("says Lane couldn't save when the rename never answers", async () => {
    const onRename = async () => { throw new TypeError("Failed to fetch") }
    render({ onRename })
    draft().type("Acme Studio")
    expect(await draft().save(onRename)).toBe(false)
    expect(text(withoutHidden(render({ onRename })))).toContain("Something went wrong. Try again.")
  })

  it("sends nothing while a rename is on its way, or while the name is unchanged or empty", async () => {
    const onRename = vi.fn(saved)
    render({ onRename })
    expect(await draft().save(onRename)).toBe(false)
    draft().type(" ")
    expect(await draft().save(onRename)).toBe(false)
    draft().type("Acme Studio")
    const first = draft().save(onRename)
    expect(await draft().save(onRename)).toBe(false)
    await first
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it("shows everyone but an Admin the name, read only, and who can change it", () => {
    for (const role of WORKSPACE_ROLES.filter(role => role !== "admin")) {
      const html = render({ role })
      expect([role, text(html)]).toEqual([role, expect.stringContaining("Acme Design")])
      expect(text(html)).toContain("Only Admins can change it.")
      expect(html).not.toContain("<form")
      expect(html).not.toContain("<input")
      expect(html).not.toContain(">Save<")
    }
  })
})
