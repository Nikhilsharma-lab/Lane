"use client";

import { useState } from "react";

interface Props {
  plan: "free" | "pro" | "enterprise";
  seatCount: number;
}

const PLAN_LABELS: Record<string, string> = { free: "Starter", pro: "Pro", enterprise: "Enterprise" };
const PLAN_PRICE: Record<string, string> = { free: "$99/month", pro: "$299/month", enterprise: "Custom" };
const MEMBER_LIMITS: Record<string, string> = { free: "Up to 3 members", pro: "Up to 10 members", enterprise: "Unlimited members" };
const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 10, enterprise: Infinity };

type Feature = { label: string; free: boolean; pro: boolean; enterprise: boolean };
const FEATURES: Feature[] = [
  { label: "Unlimited requests", free: false, pro: true, enterprise: true },
  { label: "AI triage", free: true, pro: true, enterprise: true },
  { label: "Figma sync", free: false, pro: true, enterprise: true },
  { label: "AI weekly digest", free: false, pro: true, enterprise: true },
  { label: "Email notifications", free: false, pro: true, enterprise: true },
  { label: "Linear integration", free: false, pro: false, enterprise: true },
  { label: "SLA", free: false, pro: false, enterprise: true },
];

export function PlanDisplay({ plan, seatCount }: Props) {
  const [modal, setModal] = useState<{
    targetPlan: "free" | "pro" | "enterprise";
    stage: "confirm" | "comingsoon";
  } | null>(null);

  return (
    <div className="space-y-8">
      <div className="border border-border rounded-xl px-6 py-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-lg font-semibold text-foreground">{PLAN_LABELS[plan]}</span>
          <span className="text-sm text-muted-foreground">{PLAN_PRICE[plan]}</span>
        </div>
        <p className="text-xs text-muted-foreground/60 ml-5">Annual prepay</p>
      </div>
      {/* Seat Usage */}
      {plan === "enterprise" ? (
        <p className="text-sm text-muted-foreground">Unlimited seats</p>
      ) : (
        <div className="border border-border rounded-xl px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Seats</span>
            <span className="text-sm text-muted-foreground">
              {seatCount} of {PLAN_LIMITS[plan]} used &nbsp;&middot;&nbsp;{" "}
              {Math.max(0, PLAN_LIMITS[plan] - seatCount)} available
            </span>
          </div>
          <div className="w-full bg-accent rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                seatCount / PLAN_LIMITS[plan] >= 1
                  ? "bg-red-500"
                  : seatCount / PLAN_LIMITS[plan] >= 0.8
                  ? "bg-amber-400"
                  : "bg-green-400"
              }`}
              style={{ width: `${Math.min(100, (seatCount / PLAN_LIMITS[plan]) * 100)}%` }}
            />
          </div>
          {seatCount >= PLAN_LIMITS[plan] && (
            <p className="text-xs text-red-400">Seat limit reached. Remove a member or upgrade your plan.</p>
          )}
        </div>
      )}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Features included</h2>
        <div className="space-y-0">
          <div className="flex items-center justify-between py-2.5 border-b border-border">
            <span className="text-sm text-muted-foreground">Team members</span>
            <span className="text-sm text-foreground">{MEMBER_LIMITS[plan]}</span>
          </div>
          {FEATURES.map((f) => {
            const included = plan === "free" ? f.free : plan === "pro" ? f.pro : f.enterprise;
            return (
              <div key={f.label} className="flex items-center justify-between py-2.5 border-b border-border">
                <span className={`text-sm ${included ? "text-muted-foreground" : "text-muted-foreground/60"}`}>{f.label}</span>
                {included ? <span className="text-green-400 text-sm">&#10003;</span> : <span className="text-muted-foreground/60 text-sm">&#8212;</span>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Plan Cards */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">All plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["free", "pro", "enterprise"] as const).map((p) => {
            const isCurrent = plan === p;
            const isUpgrade = p === "enterprise" || (plan === "free" && p === "pro");
            return (
              <div
                key={p}
                className={`border rounded-xl px-5 py-4 flex flex-col gap-3 ${
                  isCurrent ? "border-primary/30 bg-muted" : "border-border"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{PLAN_LABELS[p]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{PLAN_PRICE[p]}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{MEMBER_LIMITS[p]}</p>
                </div>
                {isCurrent ? (
                  <span className="text-xs text-muted-foreground border border-border rounded px-2 py-1 w-fit">
                    Current plan
                  </span>
                ) : p === "enterprise" ? (
                  <a
                    href="mailto:yash@designq.io?subject=Enterprise%20inquiry"
                    className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded px-3 py-1.5 transition-colors w-fit"
                  >
                    Contact us &rarr;
                  </a>
                ) : (
                  <button
                    onClick={() => setModal({ targetPlan: p, stage: "confirm" })}
                    className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded px-3 py-1.5 transition-colors w-fit"
                  >
                    {isUpgrade ? "Upgrade" : "Downgrade"} to {PLAN_LABELS[p]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {plan !== "enterprise" && (
        <div className="border border-border rounded-xl px-6 py-5">
          <p className="text-sm font-medium text-foreground mb-1">Need more?</p>
          <p className="text-xs text-muted-foreground mb-4">Enterprise &mdash; custom seats, Linear integration, dedicated SLA.</p>
          <a href="mailto:yash@designq.io?subject=Enterprise%20inquiry"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded-lg px-4 py-2 transition-colors">
            Contact us &rarr;
          </a>
        </div>
      )}
      {/* Billing History */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Billing history</h2>
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Invoice</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Date</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Download</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <p className="text-sm text-muted-foreground">No invoices yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Billing history will appear here once you&apos;re on a paid plan.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {/* Upgrade / Downgrade Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            {modal.stage === "confirm" ? (
              <>
                <h3 className="text-base font-semibold text-foreground">
                  {modal.targetPlan === "free" ? "Downgrade" : "Upgrade"} to {PLAN_LABELS[modal.targetPlan]}
                </h3>
                <p className="text-sm text-muted-foreground">
                  You&apos;re switching from <span className="text-foreground">{PLAN_LABELS[plan]}</span> →{" "}
                  <span className="text-foreground">{PLAN_LABELS[modal.targetPlan]}</span> ({PLAN_PRICE[modal.targetPlan]}, annual prepay).
                </p>
                {modal.targetPlan === "free" && (
                  <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                    You&apos;ll lose access to Figma sync, AI weekly digest, and email notifications.
                    {seatCount > PLAN_LIMITS.free && " You also have more than 3 members — remove members to fit the Free plan limit first."}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded-lg px-4 py-2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setModal({ ...modal, stage: "comingsoon" })}
                    className="flex-1 text-sm bg-primary text-primary-foreground hover:opacity-90 rounded-lg px-4 py-2 transition-opacity"
                  >
                    Proceed to checkout &rarr;
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-foreground">Coming soon</h3>
                <p className="text-sm text-muted-foreground">
                  Online checkout isn&apos;t available yet.{" "}
                  <a href="mailto:yash@designq.io?subject=Plan%20upgrade" className="text-primary underline underline-offset-2 hover:opacity-80">
                    Email yash@designq.io
                  </a>{" "}
                  to upgrade — we&apos;ll get you sorted within 24 hours.
                </p>
                <button
                  onClick={() => setModal(null)}
                  className="w-full text-sm text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded-lg px-4 py-2 transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
