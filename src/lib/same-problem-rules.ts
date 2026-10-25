/**
 * Same problem links (#218), client-safe. Requests that tackle the same problem are grouped; each is an Iteration,
 * numbered by when it was filed within its group. The number is worked out when read, never stored.
 */

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st" … */
export function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

/** "3rd iteration". */
export function iterationLabel(number: number): string {
  return `${ordinal(number)} iteration`;
}

/** Where a Request page lists its group's Iterations: the Outcome report's iteration note links here. */
export const ITERATIONS_SECTION_ID = "iterations";

export function iterationsHref(requestId: string): string {
  return `/requests/${requestId}#${ITERATIONS_SECTION_ID}`;
}
