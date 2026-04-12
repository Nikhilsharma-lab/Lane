"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-3 mb-1">
            <span className="w-2 h-2 rounded-full bg-accent-success shrink-0" />
            <span className="text-lg font-semibold text-foreground">{PLAN_LABELS[plan]}</span>
            <span className="text-sm text-muted-foreground">{PLAN_PRICE[plan]}</span>
          </div>
          <p className="text-xs text-muted-foreground/60 ml-5">Annual prepay</p>
        </CardContent>
      </Card>

      {/* Seat Usage */}
      {plan === "enterprise" ? (
        <p className="text-sm text-muted-foreground">Unlimited seats</p>
      ) : (
        <Card>
          <CardContent className="space-y-3">
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
                    ? "bg-accent-danger"
                    : seatCount / PLAN_LIMITS[plan] >= 0.8
                    ? "bg-accent-warning"
                    : "bg-accent-success"
                }`}
                /* progress bar width is intentionally inline since it's a dynamic computed value */
                style={{ width: `${Math.min(100, (seatCount / PLAN_LIMITS[plan]) * 100)}%` }}
              />
            </div>
            {seatCount >= PLAN_LIMITS[plan] && (
              <p className="text-xs text-destructive">Seat limit reached. Remove a member or upgrade your plan.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Features included */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Features included</h2>
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-sm text-muted-foreground">Team members</span>
              <span className="text-sm text-foreground">{MEMBER_LIMITS[plan]}</span>
            </div>
            {FEATURES.map((f) => {
              const included = plan === "free" ? f.free : plan === "pro" ? f.pro : f.enterprise;
              return (
                <div key={f.label} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0">
                  <span className={`text-sm ${included ? "text-muted-foreground" : "text-muted-foreground/60"}`}>{f.label}</span>
                  {included
                    ? <span className="text-accent-success text-sm">&#10003;</span>
                    : <span className="text-muted-foreground/60 text-sm">&#8212;</span>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Plan Cards */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">All plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["free", "pro", "enterprise"] as const).map((p) => {
            const isCurrent = plan === p;
            const isUpgrade = p === "enterprise" || (plan === "free" && p === "pro");
            return (
              <Card
                key={p}
                className={isCurrent ? "ring-primary/30 bg-muted" : ""}
              >
                <CardContent className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{PLAN_LABELS[p]}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{PLAN_PRICE[p]}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">{MEMBER_LIMITS[p]}</p>
                  </div>
                  {isCurrent ? (
                    <Badge variant="outline" className="w-fit">Current plan</Badge>
                  ) : p === "enterprise" ? (
                    <Button variant="outline" size="sm" className="w-fit" render={<a href="mailto:yash@designq.io?subject=Enterprise%20inquiry" />}>
                      Contact us &rarr;
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => setModal({ targetPlan: p, stage: "confirm" })}
                    >
                      {isUpgrade ? "Upgrade" : "Downgrade"} to {PLAN_LABELS[p]}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Need more? */}
      {plan !== "enterprise" && (
        <Card>
          <CardHeader>
            <CardTitle>Need more?</CardTitle>
            <CardDescription>Enterprise &mdash; custom seats, Linear integration, dedicated SLA.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" render={<a href="mailto:yash@designq.io?subject=Enterprise%20inquiry" />}>
              Contact us &rarr;
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Billing History */}
      <div>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Billing history</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">No invoices yet.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Billing history will appear here once you&apos;re on a paid plan.</p>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Upgrade / Downgrade Dialog */}
      <Dialog open={modal !== null} onOpenChange={(open) => { if (!open) setModal(null); }}>
        <DialogContent className="sm:max-w-md">
          {modal?.stage === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {modal.targetPlan === "free" ? "Downgrade" : "Upgrade"} to {PLAN_LABELS[modal.targetPlan]}
                </DialogTitle>
                <DialogDescription>
                  You&apos;re switching from <span className="text-foreground">{PLAN_LABELS[plan]}</span> &rarr;{" "}
                  <span className="text-foreground">{PLAN_LABELS[modal.targetPlan]}</span> ({PLAN_PRICE[modal.targetPlan]}, annual prepay).
                </DialogDescription>
              </DialogHeader>
              {modal.targetPlan === "free" && (
                <Alert>
                  <AlertDescription className="text-accent-warning">
                    You&apos;ll lose access to Figma sync, AI weekly digest, and email notifications.
                    {seatCount > PLAN_LIMITS.free && " You also have more than 3 members — remove members to fit the Free plan limit first."}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setModal(null)}>
                  Cancel
                </Button>
                <Button onClick={() => setModal({ ...modal, stage: "comingsoon" })}>
                  Proceed to checkout &rarr;
                </Button>
              </DialogFooter>
            </>
          ) : modal?.stage === "comingsoon" ? (
            <>
              <DialogHeader>
                <DialogTitle>Coming soon</DialogTitle>
                <DialogDescription>
                  Online checkout isn&apos;t available yet.{" "}
                  <a href="mailto:yash@designq.io?subject=Plan%20upgrade" className="text-primary underline underline-offset-2 hover:opacity-80">
                    Email yash@designq.io
                  </a>{" "}
                  to upgrade — we&apos;ll get you sorted within 24 hours.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" className="w-full" onClick={() => setModal(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
