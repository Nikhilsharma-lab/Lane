export const IDENTITY_TONES = [
  "raspberry",
  "persimmon",
  "chartreuse",
] as const

export type IdentityTone = (typeof IDENTITY_TONES)[number]

function firstCodePoint(value: string) {
  return Array.from(value)[0] ?? ""
}

export function identityInitials(value: string | null | undefined) {
  const words = value?.trim().split(/\s+/u).filter(Boolean) ?? []

  return words
    .slice(0, 2)
    .map(firstCodePoint)
    .join("")
    .toLocaleUpperCase()
}

export function identityTone(value: string | null | undefined): IdentityTone {
  const normalized = value?.trim().toLocaleLowerCase() ?? ""
  let hash = 0

  for (const character of normalized) {
    hash = (hash + (character.codePointAt(0) ?? 0)) % IDENTITY_TONES.length
  }

  return IDENTITY_TONES[hash]
}
