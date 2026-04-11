"use client";

import { useState } from "react";
import { X, Copy, Check, Globe, Lock, Link2 } from "lucide-react";
import { createPublishedView } from "@/app/actions/published-views";
import type { ViewFilters } from "@/db/schema/published_views";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
    >
      <div
        className="rounded-xl shadow-lg w-full max-w-md mx-4"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-center gap-2">
            <Link2 size={14} style={{ color: "hsl(var(--primary))" }} />
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "hsl(var(--foreground))",
              }}
            >
              Publish View
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              color: "hsl(var(--muted-foreground) / 0.6)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {!publishedUrl ? (
            <>
              {/* Name */}
              <div>
                <label
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "hsl(var(--muted-foreground) / 0.6)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  View name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q2 Design Pipeline"
                  className="w-full rounded-lg px-3 py-2"
                  style={{
                    fontSize: 13,
                    background: "hsl(var(--muted))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--foreground))",
                    outline: "none",
                  }}
                />
              </div>

              {/* Access mode */}
              <div>
                <label
                  style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "hsl(var(--muted-foreground) / 0.6)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Access
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAccessMode("authenticated")}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 transition-colors"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      background:
                        accessMode === "authenticated"
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted))",
                      color:
                        accessMode === "authenticated"
                          ? "#fff"
                          : "hsl(var(--muted-foreground))",
                      border: `1px solid ${
                        accessMode === "authenticated"
                          ? "hsl(var(--primary))"
                          : "hsl(var(--border))"
                      }`,
                      cursor: "pointer",
                    }}
                  >
                    <Lock size={12} />
                    Authenticated
                  </button>
                  <button
                    onClick={() => setAccessMode("public")}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 transition-colors"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      background:
                        accessMode === "public"
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted))",
                      color:
                        accessMode === "public"
                          ? "#fff"
                          : "hsl(var(--muted-foreground))",
                      border: `1px solid ${
                        accessMode === "public"
                          ? "hsl(var(--primary))"
                          : "hsl(var(--border))"
                      }`,
                      cursor: "pointer",
                    }}
                  >
                    <Globe size={12} />
                    Anyone with link
                  </button>
                </div>
              </div>

              {/* Allow comments */}
              <div className="flex items-center justify-between">
                <span
                  style={{
                    fontSize: 12,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  Allow comments
                </span>
                <button
                  onClick={() => setAllowComments((v) => !v)}
                  className="rounded-full transition-colors"
                  style={{
                    width: 36,
                    height: 20,
                    background: allowComments
                      ? "hsl(var(--primary))"
                      : "hsl(var(--accent))",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <span
                    className="block rounded-full transition-transform"
                    style={{
                      width: 14,
                      height: 14,
                      background: "#fff",
                      position: "absolute",
                      top: 3,
                      left: allowComments ? 19 : 3,
                    }}
                  />
                </button>
              </div>

              {error && (
                <p
                  style={{
                    fontSize: 12,
                    color: "#DC2626",
                    background: "#FEE2E2",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  {error}
                </p>
              )}

              <button
                onClick={handlePublish}
                disabled={submitting}
                className="w-full rounded-lg px-4 py-2.5 transition-opacity disabled:opacity-50"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  background: "hsl(var(--primary))",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {submitting ? "Publishing..." : "Publish"}
              </button>
            </>
          ) : (
            <>
              {/* Published state */}
              <div
                className="rounded-lg px-4 py-3"
                style={{
                  background: "#EAF2EC",
                  border: "1px solid #C6DCC9",
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#166534",
                    marginBottom: 4,
                  }}
                >
                  View published
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "#2E5339",
                    lineHeight: 1.5,
                  }}
                >
                  {accessMode === "public"
                    ? "Anyone with this link can view the requests."
                    : "Only authenticated team members can access this view."}
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={publishedUrl}
                  className="flex-1 rounded-lg px-3 py-2"
                  style={{
                    fontSize: 11,
                    fontFamily: "'Geist Mono', monospace",
                    background: "hsl(var(--muted))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--muted-foreground))",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleCopy}
                  className="shrink-0 rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors"
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    background: copied ? "#EAF2EC" : "hsl(var(--muted))",
                    border: `1px solid ${
                      copied ? "#C6DCC9" : "hsl(var(--border))"
                    }`,
                    color: copied ? "#166534" : "hsl(var(--foreground))",
                    cursor: "pointer",
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full rounded-lg px-4 py-2 transition-colors"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
