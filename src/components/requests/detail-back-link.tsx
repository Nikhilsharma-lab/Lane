import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import buttonStyles from "@/components/arc/button/button.module.css"
import styles from "./detail.module.css"

/**
 * Plan item 2.5: the phone's way back from Request detail. Desktop has no
 * close control: the crumbs and Esc return to the list. `always` shows it at
 * every width (Request unavailable, which has no content to return from).
 * Its own module, so the loading frame does not carry the strip's islands.
 */
export function DetailBackLink({ href, always = false }: { href: string; always?: boolean }) {
  return <Link href={href} aria-label="Back to Requests" className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.sm} ${styles.iconButton} ${always ? "" : styles.back}`}>
    <ArrowLeft size={16} aria-hidden="true" />
  </Link>
}
