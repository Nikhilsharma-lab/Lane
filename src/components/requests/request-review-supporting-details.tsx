import { ExternalLink, FileText, Link as LinkIcon } from "lucide-react"
import { formatAttachmentSize } from "@/lib/request-attachments"
import styles from "./requests.module.css"

type ReviewFile = { key: string; file: Pick<File, "name" | "size"> }
export function RequestReviewSupportingDetails({ relatedLink, files }: { relatedLink: string; files: readonly ReviewFile[] }) {
  if (!relatedLink && files.length === 0) return null
  return <section aria-labelledby="review-supporting-heading" className="space-y-3 border-t pt-5"><h2 id="review-supporting-heading" className="text-base font-medium">Links and files</h2><p className="text-sm text-muted-foreground">AI reviews only your title and description.{files.length > 0 && " Files upload after you create the Request."}</p>
    {relatedLink && <a className={styles.fileRow} href={relatedLink} target="_blank" rel="noopener noreferrer"><LinkIcon size={16} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">Related link<span className="sr-only"> (opens in a new tab)</span></p><p className="break-all text-sm text-muted-foreground">{relatedLink}</p></div><ExternalLink size={16} aria-hidden="true" /></a>}
    {files.length > 0 && <ul aria-label="Files ready to upload" className="divide-y">{files.map(({ key, file }) => <li key={key} className={styles.fileRow}><FileText size={16} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{file.name}</p><p className="text-sm text-muted-foreground">{formatAttachmentSize(file.size)}</p></div></li>)}</ul>}
  </section>
}
