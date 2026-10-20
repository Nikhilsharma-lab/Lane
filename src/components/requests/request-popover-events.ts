// Radix can defer outside-pointer handling until click. A menu action may
// remove its own target first, so closest() can no longer identify the portal.
// Remember the original event, not the element or a timeout-based exemption.
const insideEvents = new WeakSet<Event>();

export function rememberRequestPopoverEvent(event: Event) {
  insideEvents.add(event);
}

export function isRequestPopoverEvent(event: Event) {
  return insideEvents.has(event);
}
