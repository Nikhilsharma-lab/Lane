"use client"

import { useState } from "react"
import { Download, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Feedback } from "@/components/ui/feedback"

import { getAttachmentDownloadUrl } from "./actions"

export function AttachmentDownload({
  attachmentId,
  context,
}: {
  attachmentId: string
  context: { orgId: string }
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    if (pending) return
    setPending(true)
    setError(null)

    try {
      const result = await getAttachmentDownloadUrl(
        attachmentId,
        context
      )
      if (!("success" in result) || !result.success || !result.url) {
        setError(result.error ?? "Lane could not prepare this download.")
        return
      }

      window.location.assign(result.url)
    } catch {
      setError("Lane could not prepare this download. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={pending ? "Preparing download" : "Download file"}
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={() => void download()}
      >
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
            strokeWidth={1.8}
          />
        ) : (
          <Download aria-hidden="true" strokeWidth={1.8} />
        )}
      </Button>
      {error && (
        <Feedback kind="error" variant="inline">
          {error}
        </Feedback>
      )}
    </div>
  )
}
