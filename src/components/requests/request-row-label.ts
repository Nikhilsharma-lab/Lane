/** "1 Request matches" or "{n} Requests match". The toolbar shows it; the list announces it with a full stop. */
export function matchCountText(count: number) {
  return `${count} ${count === 1 ? "Request matches" : "Requests match"}`
}

/** "1 Request" or "{n} Requests". */
export function requestCount(count: number) {
  return `${count} ${count === 1 ? "Request" : "Requests"}`
}
