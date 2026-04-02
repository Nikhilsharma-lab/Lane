"use client";

import { useState } from "react";

interface Props {
  plan: "free" | "pro" | "enterprise";
  seatCount: number;
}

const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", enterprise: "Enterprise" };
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
  return (
    <div className="space-y-8">
      <div className="border border-zinc-800 rounded-xl px-6 py-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-lg font-semibold text-white">{PLAN_LABELS[plan]}</span>
          <span className="text-sm text-zinc-500">{PLAN_PRICE[plan]}</span>
        </div>
        <p className="text-xs text-zinc-600 ml-5">Annual prepay</p>
      </div>
      {/* Seat Usage */}
      {plan === "enterprise" ? (
        <p className="text-sm text-zinc-400">Unlimited seats</p>
      ) : (
        <div className="border border-zinc-800 rounded-xl px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">Seats</span>
            <span className="text-sm text-zinc-500">
              {seatCount} of {PLAN_LIMITS[plan]} used &nbsp;&middot;&nbsp;{" "}
              {Math.max(0, PLAN_LIMITS[plan] - seatCount)} available
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
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
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Features included</h2>
        <div className="space-y-0">
          <div className="flex items-center justify-between py-2.5 border-b border-zinc-900">
            <span className="text-sm text-zinc-400">Team members</span>
            <span className="text-sm text-zinc-300">{MEMBER_LIMITS[plan]}</span>
          </div>
          {FEATURES.map((f) => {
            const included = plan === "free" ? f.free : plan === "pro" ? f.pro : f.enterprise;
            return (
              <div key={f.label} className="flex items-center justify-between py-2.5 border-b border-zinc-900">
                <span className={`text-sm ${included ? "text-zinc-400" : "text-zinc-700"}`}>{f.label}</span>
                {included ? <span className="text-green-400 text-sm">&#10003;</span> : <span className="text-zinc-700 text-sm">&#8212;</span>}
              </div>
            );
          })}
        </div>
      </div>
      {plan !== "enterprise" && (
        <div className="border border-zinc-800 rounded-xl px-6 py-5">
          <p className="text-sm font-medium text-white mb-1">Need more?</p>
          <p className="text-xs text-zinc-500 mb-4">Enterprise &mdash; custom seats, Linear integration, dedicated SLA.</p>
          <a href="mailto:hello@designq.io?subject=Enterprise%20inquiry"
            className="inline-flex items-center text-sm text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2 transition-colors">
            Contact us &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
