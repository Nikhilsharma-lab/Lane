"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <div className="border rounded-xl p-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">This request hasn&apos;t been analyzed by AI yet</p>
      <Button
        variant="outline"
        onClick={handleTriage}
        disabled={loading}
        className="text-sm bg-primary/10 text-primary border-primary/25 hover:bg-primary/20 hover:border-primary/40"
      >
        {loading ? "Analyzing..." : "Run AI Triage"}
      </Button>
      {error && <p className="text-xs text-accent-danger">{error}</p>}
    </div>
  );
}
