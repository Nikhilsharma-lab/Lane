/** Types for colour.mjs, Lane's one copy of colour maths. */
export type LinearRgb = [number, number, number]
export function toLinear(gamma: number): number
export function toGamma(linear: number): number
export function parseColour(value: string): { linear: LinearRgb; alpha: number } | null
export function toHex(value: string): string
export function luminance(linear: readonly number[]): number
export function contrastRatio(foreground: string, background: string): number
