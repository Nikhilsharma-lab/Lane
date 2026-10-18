import { REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS } from "@/lib/request-constants";
import { PriorityGlyph } from "./row-presentation";

/** One ordered set of values, labels and icons for pickers and row menus. */
export const priorityOptions = REQUEST_PRIORITIES.map(value => ({
  value,
  label: REQUEST_PRIORITY_LABELS[value],
  icon: <PriorityGlyph priority={value} />,
}));
