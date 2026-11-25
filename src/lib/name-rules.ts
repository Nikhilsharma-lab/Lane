/**
 * The one rule for a workspace's name and a person's, safe in the browser: trimmed, one line of plain text that shows
 * something, at most 100 characters. The sign-up, Profile, Onboarding and workspace forms and Lane's create and rename
 * actions read a typed name with `readName`. A person's name can also be set on Better Auth's own route, so what
 * emails a stored one uses `plainName`.
 */
export const NAME_MAX = 100

/** Control characters, line and paragraph breaks, and the marks that turn text backwards. */
const NOT_PLAIN = /[\p{Cc}\p{Zl}\p{Zp}‪-‮⁦-⁩]/u
const NOT_PLAIN_RUNS = new RegExp(`${NOT_PLAIN.source}+`, "gu")
const SHOWS_SOMETHING = /[\p{L}\p{N}\p{P}\p{S}]/u

/** Whole code points, so a cut never halves one. */
const characters = (text: string) => Array.from(text)

export type NameCode = "NAME_NOT_PLAIN" | "NAME_TOO_LONG"

/** A typed name, trimmed, or why it can't be one; no code when there is nothing to read in it. */
export function readName(typed: unknown): { ok: true; name: string } | { ok: false; code?: NameCode } {
  const name = typeof typed === "string" ? typed.trim() : ""
  if (!SHOWS_SOMETHING.test(name)) return { ok: false }
  if (NOT_PLAIN.test(name)) return { ok: false, code: "NAME_NOT_PLAIN" }
  return characters(name).length > NAME_MAX ? { ok: false, code: "NAME_TOO_LONG" } : { ok: true, name }
}

/** A stored name as one line of text, cut at 100 characters; empty when it shows nothing. */
export function plainName(stored: string): string {
  if (!SHOWS_SOMETHING.test(stored)) return ""
  const line = stored.replace(NOT_PLAIN_RUNS, " ").replace(/\s+/g, " ").trim()
  const all = characters(line)
  return all.length > NAME_MAX ? `${all.slice(0, NAME_MAX - 1).join("")}…` : line
}
