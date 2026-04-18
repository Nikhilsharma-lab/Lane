"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { finishOnboarding } from "@/app/actions/onboarding";
import type { OnboardingVariant } from "@/lib/onboarding/detect-persona";

interface OnboardingFlowProps {
  variant: OnboardingVariant;
  userId: string;
  workspaceId: string;
  firstName: string;
  workspaceName: string;
  inviterFirstName: string | null;
}

export function OnboardingFlow({
  variant,
  firstName,
  workspaceName,
  inviterFirstName,
}: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  function handleFinishOnboarding() {
    startTransition(async () => {
      await finishOnboarding();
      router.push("/dashboard");
      router.refresh();
    });
  }

  // --- Design Head: 4 screens ---
  if (variant === "design_head") {
    switch (step) {
      // Screen 1 — Welcome
      case 0:
        return (
          <div className="space-y-6 text-center">
            <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
              Lane
            </p>

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                Welcome, {firstName}. You&apos;re in.
              </h1>
              <p className="text-sm text-muted-foreground">
                Design work has its own rhythm. Lane is built for it.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button size="lg" onClick={() => setStep(1)} disabled={isPending}>
                Show me around
              </Button>
              <div>
                <button
                  type="button"
                  onClick={handleFinishOnboarding}
                  disabled={isPending}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  Skip — I&apos;ll explore on my own
                </button>
              </div>
            </div>
          </div>
        );

      // Screen 2 — How Requests move
      case 1:
        return (
          <div className="space-y-6">
            <PhaseModelDiagram />

            <div className="space-y-3 text-center">
              <h2 className="text-xl font-semibold text-foreground">
                Design work lives in Requests.
              </h2>
              <div className="text-sm text-muted-foreground space-y-2 max-w-md mx-auto">
                <p>
                  A Request starts when someone describes a problem. It moves
                  through Predesign, Design, Build, and Track — but not in
                  straight lines pretending to be certainty. Inside the Design
                  phase, the work is non-linear: Sense, Frame, Diverge,
                  Converge, Prove.
                </p>
                <p>
                  You don&apos;t estimate a Request. You give it an appetite,
                  shape it, let it breathe, and ship it when it&apos;s ready.
                </p>
              </div>
            </div>

            <div className="text-center pt-2">
              <Button size="lg" onClick={() => setStep(2)} disabled={isPending}>
                Got it
              </Button>
            </div>
          </div>
        );

      // Screen 3 — Sample team or start real
      case 2:
        return (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                Want to poke around first?
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                We can load a sample team — Consumer app, four Requests in
                different phases, a few fake teammates. Explore without
                commitment. Clear the sample when you&apos;re ready to start
                for real.
              </p>
            </div>

            <div className="grid gap-3 max-w-md mx-auto">
              {/* Card 1 — Sample team (recommended) */}
              <Card
                className="relative border-2"
                style={{
                  borderColor:
                    "var(--color-border-info, hsl(var(--primary)))",
                }}
              >
                <Badge
                  variant="secondary"
                  className="absolute top-3 right-3 text-xs"
                >
                  Recommended
                </Badge>
                <CardContent className="p-5 space-y-3 text-left">
                  <div>
                    <p className="font-medium text-sm text-foreground">
                      Start with a sample team
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Realistic data, zero commitment. Clear it anytime.
                    </p>
                  </div>
                  <Button
                    size="default"
                    onClick={() => {
                      startTransition(async () => {
                        const { seedSampleTeam } = await import(
                          "@/app/actions/seed-sample-team"
                        );
                        await seedSampleTeam();
                        setStep(3);
                      });
                    }}
                    disabled={isPending}
                  >
                    Load sample
                  </Button>
                </CardContent>
              </Card>

              {/* Card 2 — Skip sample, go straight to dashboard */}
              <Card>
                <CardContent className="p-5 space-y-3 text-left">
                  <div>
                    <p className="font-medium text-sm text-foreground">
                      Skip sample — start for real
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Jump straight to your dashboard. Create a team from Settings.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={() => {
                      startTransition(async () => {
                        await finishOnboarding();
                        router.push("/dashboard");
                        router.refresh();
                      });
                    }}
                    disabled={isPending}
                  >
                    Skip sample
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      // Screen 4 — First action prompt
      case 3:
        return (
          <div className="space-y-6 text-center">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">
                    Your first move
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Submit a Request to your team&apos;s Intake. That&apos;s
                    how work enters Lane.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    size="lg"
                    onClick={() => {
                      startTransition(async () => {
                        await finishOnboarding();
                        router.push("/dashboard/requests");
                        router.refresh();
                      });
                    }}
                    disabled={isPending}
                  >
                    Submit first request
                  </Button>
                  <div>
                    <button
                      type="button"
                      onClick={handleFinishOnboarding}
                      disabled={isPending}
                      className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    >
                      Show me the sidebar instead
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
    }
  }

  // --- Designer: 2 screens ---
  if (variant === "designer") {
    switch (step) {
      // Screen 1 — Welcome
      case 0:
        return (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                {inviterFirstName
                  ? `${inviterFirstName} added you to ${workspaceName}.`
                  : `You\u2019ve joined ${workspaceName}.`}
              </h1>
              <p className="text-sm text-muted-foreground">
                You&apos;re a designer on {workspaceName}. Lane will get you
                to your first Request in a moment.
              </p>
            </div>

            <Button
              size="lg"
              onClick={() => setStep(1)}
              disabled={isPending}
            >
              Continue
            </Button>
          </div>
        );

      // Screen 2 — Waiting state (assigned-Request branch is a follow-up)
      case 1:
        return (
          <div className="space-y-6 text-center">
            <Card>
              <CardContent className="p-6 space-y-4 text-left">
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have any Requests yet. Your team lead will
                  assign one soon. In the meantime, explore the sidebar —
                  your team&apos;s work lives in {workspaceName}.
                </p>
              </CardContent>
            </Card>

            <Button
              size="lg"
              onClick={handleFinishOnboarding}
              disabled={isPending}
            >
              Explore Lane
            </Button>
          </div>
        );
    }
  }

  // --- PM: 2 screens ---
  if (variant === "pm") {
    switch (step) {
      // Screen 1 — Welcome with intake foreshadowing
      case 0:
        return (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                {inviterFirstName
                  ? `${inviterFirstName} added you to ${workspaceName}.`
                  : `You\u2019ve joined ${workspaceName}.`}
              </h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                You&apos;re a PM on {workspaceName}. In Lane, PMs submit
                design work by describing problems — not proposing solutions.
                More on that in a second.
              </p>
            </div>

            <Button
              size="lg"
              onClick={() => setStep(1)}
              disabled={isPending}
            >
              Continue
            </Button>
          </div>
        );

      // Screen 2 — Land on Intake (Item 4's classifier fires naturally)
      case 1:
        return (
          <div className="space-y-6 text-center">
            <Card>
              <CardContent className="p-6 space-y-4 text-left">
                <p className="text-sm text-muted-foreground">
                  This is {workspaceName}&apos;s Intake. Requests you submit
                  here get shaped into design work. Ready to try it?
                </p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Button
                size="lg"
                onClick={() => {
                  startTransition(async () => {
                    await finishOnboarding();
                    router.push("/dashboard/requests");
                    router.refresh();
                  });
                }}
                disabled={isPending}
              >
                Submit your first request
              </Button>
              <div>
                <button
                  type="button"
                  onClick={handleFinishOnboarding}
                  disabled={isPending}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  I&apos;ll look around first
                </button>
              </div>
            </div>
          </div>
        );
    }
  }

  // Fallback — should never reach here
  return null;
}

// --- Phase Model Diagram (Screen 2) ---

function PhaseModelDiagram() {
  const phases = [
    { label: "Predesign", expanded: false },
    { label: "Design", expanded: true },
    { label: "Build", expanded: false },
    { label: "Track", expanded: false },
  ];

  const designStages = ["Sense", "Frame", "Diverge", "Converge", "Prove"];

  return (
    <div className="space-y-4">
      {/* Four phases — connected pills */}
      <div className="flex items-center justify-center">
        {phases.map((phase, i) => (
          <div key={phase.label} className="flex items-center">
            <div
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                phase.expanded
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {phase.label}
            </div>
            {i < phases.length - 1 && (
              <div className="w-6 h-px bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Connector line */}
      <div className="flex items-center justify-center">
        <div className="w-px h-3 bg-border" />
      </div>

      {/* Design stages — subtle expansion below the Design pill */}
      <div className="flex items-center justify-center">
        {designStages.map((stage, i) => (
          <div key={stage} className="flex items-center">
            <div className="px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground bg-muted/50 border border-border/50">
              {stage}
            </div>
            {i < designStages.length - 1 && (
              <div className="w-3 h-px bg-border/50" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
