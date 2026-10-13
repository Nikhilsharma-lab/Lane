import { within } from "storybook/test"

/** Plan item 2.4: the Requests list is a treegrid (grid when ungrouped). These read it the way assistive tech does. */

/** The Request rows (not group headers) shown inside this element, in order. */
export function requestRows(container: HTMLElement) {
  return within(container).getAllByRole("row").filter(row => row.hasAttribute("data-request-id"))
}

/** A status, Project or assignee group, by its name ("Open Requests"). */
export function requestGroup(container: HTMLElement, name: string) {
  return within(container).getByRole("rowgroup", { name })
}

export function queryRequestGroup(container: HTMLElement, name: string) {
  return within(container).queryByRole("rowgroup", { name })
}

/** The grid row around an element, such as a title link. */
export function rowOf(element: Element) {
  return element.closest<HTMLElement>('[role="row"]')!
}

/** The Request row with this id. */
export function requestRow(container: HTMLElement, id: string) {
  return container.querySelector<HTMLElement>(`[role="row"][data-request-id="${id}"]`)!
}

/** The list's one polite region (plan item 2.4). */
export function announcer(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-slot="list-announcer"]')!
}
