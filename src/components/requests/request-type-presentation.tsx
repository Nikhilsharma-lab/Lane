import { Rows3 } from "lucide-react";
import { REQUEST_TYPES, REQUEST_TYPE_LABELS, type RequestType } from "@/lib/request-constants";
import styles from "./request-type-presentation.module.css";

export function RequestTypeGlyph({ type }: { type: RequestType | null | undefined }) {
  return <Rows3 className={styles.icon} data-request-type={type ?? "none"} aria-hidden="true" />;
}
export const requestTypeOptions = [
  { value: "none", label: "No type", icon: <RequestTypeGlyph type={null} /> },
  ...REQUEST_TYPES.map(value => ({ value, label: REQUEST_TYPE_LABELS[value], icon: <RequestTypeGlyph type={value} /> })),
];
