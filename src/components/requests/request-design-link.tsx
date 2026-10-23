import { ExternalLink, Link as LinkIcon } from "lucide-react"
import type { SavedDesignReview } from "@/lib/request-design-link"
import detailStyles from "./detail.module.css"
import styles from "./requests.module.css"

function safeDesignUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url : null
  } catch { return null }
}

export function isFigmaLink(value: string | null | undefined): boolean {
  const url = safeDesignUrl(value)
  return Boolean(url && (url.hostname === "figma.com" || url.hostname.endsWith(".figma.com")))
}

/** Reviews stay in Figma. Retain the most recent saved design reference without presenting old review activity. */
export function RequestDesignLink({ relatedLink, reviews = [] }: { relatedLink?: string | null; reviews?: readonly SavedDesignReview[] }) {
  const designUrl = isFigmaLink(relatedLink) ? relatedLink! : reviews.findLast(review => safeDesignUrl(review.designUrl))?.designUrl
  if (!designUrl) return null
  const figma = isFigmaLink(designUrl)
  return <section id="design" aria-labelledby="design-heading" className={detailStyles.section}>
    <h2 id="design-heading" className={detailStyles.sectionHeading}>Design</h2>
    <a href={designUrl} target="_blank" rel="noopener noreferrer" className={styles.fileRow}>
      <LinkIcon aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm">{figma ? "Open in Figma" : "Open design"}<span className="sr-only"> (opens in a new tab)</span></span>
      <ExternalLink aria-hidden="true" />
    </a>
  </section>
}
