"use client";

import { useState } from "react";
import { Copy, Check, Globe, Lock, Link2 } from "lucide-react";
import { createPublishedView } from "@/app/actions/published-views";
import type { ViewFilters } from "@/db/schema/published_views";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface Props {
  currentFilters: ViewFilters;
  viewType: string;
  onClose: () => void;
}

export function ShareDialog({ currentFilters, viewType, onClose }: Props) {
  const [name, setName] = useState("");
  const [accessMode, setAccessMode] = useState<"authenticated" | "public">(
    "authenticated"
  );
  const [allowComments, setAllowComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await createPublishedView({
      name: name.trim(),
      viewType,
      filters: currentFilters,
      accessMode,
      allowComments,
    });

    setSubmitting(false);

    if ("error" in result) {
      setError(result.error ?? "Failed to publish");
      return;
    }

    const base = window.location.origin;
    const url =
      accessMode === "public"
        ? `${base}/views/${result.viewId}?token=${result.publicToken}`
        : `${base}/views/${result.viewId}`;
    setPublishedUrl(url);
  }

  function handleCopy() {
    if (!publishedUrl) return;
    navigator.clipboard.writeText(publishedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 size={14} className="text-primary" />
            Publish View
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!publishedUrl ? (
            <>
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="font-mono text-[9px] font-medium tracking-[0.07em] uppercase text-muted-foreground/60">
                  View name
                </Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q2 Design Pipeline"
                />
              </div>

              {/* Access mode */}
              <div className="space-y-1.5">
                <Label className="font-mono text-[9px] font-medium tracking-[0.07em] uppercase text-muted-foreground/60">
                  Access
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant={accessMode === "authenticated" ? "default" : "outline"}
                    className="flex-1"
                    size="sm"
                    onClick={() => setAccessMode("authenticated")}
                  >
                    <Lock size={12} />
                    Authenticated
                  </Button>
                  <Button
                    variant={accessMode === "public" ? "default" : "outline"}
                    className="flex-1"
                    size="sm"
                    onClick={() => setAccessMode("public")}
                  >
                    <Globe size={12} />
                    Anyone with link
                  </Button>
                </div>
              </div>

              {/* Allow comments */}
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Allow comments
                </Label>
                <Switch
                  checked={allowComments}
                  onCheckedChange={setAllowComments}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handlePublish}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? "Publishing..." : "Publish"}
              </Button>
            </>
          ) : (
            <>
              {/* Published state */}
              <div className="rounded-lg px-4 py-3 bg-[color-mix(in_oklch,var(--accent-success)_10%,transparent)] border border-[color-mix(in_oklch,var(--accent-success)_20%,transparent)]">
                <p className="text-xs font-semibold text-[var(--accent-success)] mb-1">
                  View published
                </p>
                <p className="text-[11px] text-[var(--accent-success)] leading-normal">
                  {accessMode === "public"
                    ? "Anyone with this link can view the requests."
                    : "Only authenticated team members can access this view."}
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  type="text"
                  readOnly
                  value={publishedUrl}
                  className="flex-1 font-mono text-[11px]"
                />
                <Button
                  variant={copied ? "secondary" : "outline"}
                  size="sm"
                  onClick={handleCopy}
                  className={cn(
                    copied && "bg-[color-mix(in_oklch,var(--accent-success)_10%,transparent)] border-[color-mix(in_oklch,var(--accent-success)_20%,transparent)] text-[var(--accent-success)]"
                  )}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <Button
                variant="outline"
                onClick={onClose}
                className="w-full"
              >
                Done
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
