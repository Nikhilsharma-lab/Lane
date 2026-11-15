/** "50%", "12 ms" or "No baseline": a result's value in its unit, for the Journey's details and its close forms. */
export const resultValue = (n: number | null, unit: string) => n === null ? "No baseline" : unit === "%" ? `${n}%` : `${n} ${unit}`.trim()
