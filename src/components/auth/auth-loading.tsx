import { Skeleton } from "@/components/arc/skeleton/skeleton";
import styles from "./auth.module.css";

export function AuthLoading({ label, roles = false }: { label: string; roles?: boolean }) {
  return <div className={styles.form}><Skeleton label={label} lines={roles ? 6 : 4} /></div>;
}
