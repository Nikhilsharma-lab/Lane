"use client"

import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { useState } from "react"
import { Download, LoaderCircle } from "lucide-react"

import { Button } from "@/components/arc/button/button"
import { Alert } from "@/components/arc/alert/alert"

import { getAttachmentDownloadUrl } from "./actions"

export function AttachmentDownload({
  attachmentId,
  fileName,
  context,
}: {
  attachmentId: string
  /** Names the button, so each file's download is told apart by a screen reader. */
  fileName: string
  context: { orgId: string }
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    if (pending) return
    setPending(true)
    setError(null)

    try {
      const result = await callAction(() => getAttachmentDownloadUrl(
        attachmentId,
        context
      ))
      if (!("success" in result) || !result.success || !result.url) {
        setError(result.error ?? "Couldn’t prepare the download. Try again.")
        return
      }

      window.location.assign(result.url)
    } catch (thrown) {
      setError(thrownMessage(thrown, "Couldn’t prepare the download. Try again."))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={pending ? `Preparing ${fileName}` : `Download ${fileName}`}
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={() => void download()}
      >
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <Download aria-hidden="true" />
        )}
      </Button>
      {error && (
        <Alert tone="danger" title="Action failed">
          {error}
        </Alert>
      )}
    </div>
  )
}
