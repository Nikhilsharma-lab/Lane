import styles from "./auth.module.css";
import { Placeholder } from "@/components/loading/placeholder";

export function AuthLoading({ label, roles = false }: { label: string; roles?: boolean }) {
  return <div className={styles.form}><Placeholder label={label} lines={roles ? 6 : 4} /></div>;
}
