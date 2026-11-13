import { linkSegments } from "@/lib/text-links"
import styles from "./linked-text.module.css"

/**
 * Plain text with its web addresses as links that open in a new tab (#281, B21; Quarter notes since #209). It renders
 * only the text's own segments: the caller's element keeps its line breaks and wrapping. No client code.
 */
export function LinkedText({ text }: { text: string }) {
  return linkSegments(text).map((segment, index) => segment.kind === "link"
    ? <a key={index} href={segment.href} className={styles.link} rel="noopener noreferrer" target="_blank">{segment.href}<span className="sr-only"> (opens in a new tab)</span></a>
    : <span key={index}>{segment.text}</span>)
}
