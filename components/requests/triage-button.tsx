"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TriageButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTriage() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/triage`, { method: "POST" });
      const data = await res.json();
      if (data.error && data.error !== "Already triaged") {
        setError(data.error);
      } else {
        router.refresh();
      }
    } catch {
      setError("Failed to run triage");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[var(--border)] rounded-xl p-6 text-center space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">This request hasn&apos;t been analyzed by AI yet</p>
      <button
        onClick={handleTriage}
        disabled={loading}
        className="text-sm bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/25 hover:bg-[var(--accent-subtle)] hover:border-[var(--accent)]/40 rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
      >
        {loading ? "Analyzing..." : "Run AI Triage"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
