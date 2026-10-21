"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { useOptimisticAction, useServerRefresh } from "./use-optimistic-action";
import { useRouter } from "next/navigation";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Select } from "@/components/arc/select/select";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { AttachmentDownload } from "@/app/(app)/requests/[id]/attachment-download";
import { ExpectedImpactSummary } from "./expected-impact-summary";
import {
  agreementBlockReason,
  preparedSchema,
  disciplines,
  type Discipline,
  type PreparedAgreement,
  type AgreementSnapshot,
} from "@/lib/request-agreement";
import * as actions from "@/app/(app)/requests/[id]/agreement-actions";
import styles from "./request-agreement.module.css";
type View = Exclude<
  Awaited<ReturnType<typeof actions.readAgreement>>,
  { error: string }
>;
type People = Extract<
  Awaited<ReturnType<typeof actions.loadAgreementPeople>>,
  { people: unknown }
>["people"];
const names: Record<Discipline, string> = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
};
const fields = [
  ["scopeIncluded", "Included scope"],
  ["scopeExcluded", "Excluded scope"],
  ["audience", "Audience"],
  ["timing", "Timing and dependencies"],
  ["constraints", "Constraints"],
  ["feasibility", "Known feasibility"],
] as const;
const draftSchema = z.object({
  prepared: preparedSchema.extend(
    Object.fromEntries(
      fields.map(([f]) => [f, z.string().max(4000)]),
    ) as Record<(typeof fields)[number][0], z.ZodString>,
  ),
  selected: z.object({
    pm: z.string(),
    designer: z.string(),
    developer: z.string(),
  }),
  blocker: z.string().max(4000),
  blockerSeat: z.enum(disciplines),
});
const contextLabels: Record<string, string> = {
  title: "Title",
  description: "Description",
  reframedProblem: "Confirmed problem",
  observedEvidence: "Observed evidence",
  uncertainty: "Uncertainty",
  extractedSolution: "Original solution",
  affectedPeople: "Affected people",
  desiredChange: "Desired change",
  usefulLink: "Related link",
  expectedImpact: "Expected impact",
  requestType: "Request type",
  projectId: "Project",
  labelKeys: "Labels",
  ...Object.fromEntries(fields),
};
const empty: PreparedAgreement = {
  version: 1,
  commitmentKind: "delivery",
  scopeIncluded: "",
  scopeExcluded: "",
  audience: "",
  timing: "",
  constraints: "",
  feasibility: "",
};
const keyOf = (n: People[number]["nominee"]) =>
  n.kind === "member" ? `member:${n.userId}` : `invitation:${n.invitationId}`;
export function RequestAgreementPanel({
  requestId,
  orgId,
  userId,
  isAdmin,
  isGuest,
  revision,
}: {
  requestId: string;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  isGuest: boolean;
  revision?: number;
}) {
  const router = useRouter();
  const runAction = useOptimisticAction();
  const refresh = useServerRefresh();
  const { toast } = useToastStack();
  const [view, setView] = useState<View | null>(null);
  const [people, setPeople] = useState<People>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(empty);
  const [selected, setSelected] = useState<Record<Discipline, string>>({
    pm: "",
    designer: "",
    developer: "",
  });
  const [unavailable, setUnavailable] = useState(false);
  const [reason, setReason] = useState("");
  const [blocker, setBlocker] = useState("");
  const [blockerSeat, setBlockerSeat] = useState<Discipline>("developer");
  const [correctionField, setCorrectionField] = useState("description");
  const [wording, setWording] = useState("");
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const running = useRef(false);
  const restored = useRef(false);
  const storageKey = `lane:agreement:${orgId}:${userId}:${requestId}`;
  const applyView = useCallback(
    (result: Awaited<ReturnType<typeof actions.readAgreement>>) => {
      if ("error" in result) {
        setError(result.error || "Could not load agreement.");
        return;
      }
      setView(result);
      if (!restored.current) {
        restored.current = true;
        let draft: null | {
          prepared: PreparedAgreement;
          selected: Record<Discipline, string>;
          blocker: string;
          blockerSeat: Discipline;
        } = null;
        try {
          const saved = draftSchema.safeParse(
            JSON.parse(localStorage.getItem(storageKey) || "null"),
          );
          if (saved.success) draft = saved.data;
        } catch {}
        if (!result.agreement?.snapshot && draft) {
          setPrepared({ ...empty, ...draft.prepared });
          setSelected(draft.selected);
          setBlocker(draft.blocker);
          setBlockerSeat(draft.blockerSeat);
        } else if (result.agreement) {
          setPrepared(result.agreement.prepared);
          setSelected(
            Object.fromEntries(
              disciplines.map((d) => [
                d,
                result.agreement?.seats[d]
                  ? keyOf(result.agreement.seats[d]!.nominee)
                  : "",
              ]),
            ) as Record<Discipline, string>,
          );
        }
      }
    },
    [storageKey],
  );
  const load = useCallback(async () => {
    try {
      const result = await actions.readAgreement(requestId, { orgId });
      applyView(result);
      return result;
    } catch {
      const result = { error: "Could not load agreement. Try again." };
      setError(result.error);
      return result;
    }
  }, [applyView, requestId, orgId]);
  const loadPeople = useCallback(async () => {
    try {
      const result = await actions.loadAgreementPeople({ orgId });
      if ("error" in result)
        setError(result.error || "Could not load participants.");
      else setPeople(result.people);
    } catch {
      setError("Could not load participants. Try again.");
    }
  }, [orgId]);
  useEffect(() => {
    let active = true;
    void actions
      .readAgreement(requestId, { orgId })
      .then((result) => {
        if (active) applyView(result);
      })
      .catch(() => {
        if (active) setError("Could not load agreement. Try again.");
      });
    if (!isGuest)
      void actions
        .loadAgreementPeople({ orgId })
        .then((result) => {
          if (!active) return;
          if ("error" in result)
            setError(result.error || "Could not load participants.");
          else setPeople(result.people);
        })
        .catch(() => {
          if (active) setError("Could not load participants. Try again.");
        });
    return () => {
      active = false;
    };
  }, [applyView, requestId, orgId, isGuest, revision]);
  useEffect(() => {
    if (restored.current && !view?.agreement?.snapshot)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ prepared, selected, blocker, blockerSeat }),
        );
      } catch {}
  }, [prepared, selected, blocker, blockerSeat, storageKey, view]);
  async function run(
    kind: keyof Pick<
      typeof actions,
      | "prepareAgreement"
      | "submitAgreement"
      | "decideAgreement"
      | "resolveAgreementConcern"
      | "replaceAgreementParticipant"
      | "addAgreementCorrection"
      | "createAgreementReplacement"
      | "confirmRequestSuperseded"
    >,
    input: unknown,
  ) {
    if (!view || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({
      kind,
      input,
      revision: view.revision,
    });
    if (retry.current?.fingerprint !== fingerprint)
      retry.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const operationId = retry.current.id;
      const outcome = await runAction({
        id: requestId,
        waitForPending: true,
        refreshOnError: false,
        run: () =>
          actions[kind](
            { orgId, requestId, expectedRevision: view.revision, operationId },
            input,
          ),
        onError: (message, { thrown }) =>
          setError(
            thrown
              ? "Couldn’t confirm the change. Your input is preserved. Retry to recover the saved result."
              : message,
          ),
      });
      if (outcome.status !== "success") return;
      const result = outcome.value;
      retry.current = null;
      if (kind === "prepareAgreement") setBlocker("");
      toast({ type: "success", title: "Agreement saved" });
      if (kind === "submitAgreement")
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      const latest = await load();
      if (
        kind === "prepareAgreement" &&
        !("error" in latest) &&
        latest.agreement
      ) {
        setPrepared(latest.agreement.prepared);
        setSelected(
          Object.fromEntries(
            disciplines.map((d) => [
              d,
              latest.agreement?.seats[d]
                ? keyOf(latest.agreement.seats[d]!.nominee)
                : "",
            ]),
          ) as Record<Discipline, string>,
        );
      }
      if (
        kind === "createAgreementReplacement" &&
        "replacementId" in result &&
        result.replacementId
      )
        router.push(`/requests/${result.replacementId}`);
    } catch {
      setError(
        "Couldn’t confirm the change. Your input is preserved. Retry to recover the saved result.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  if (!view)
    return (
      <section id="agreement" aria-label="Agreement" className={styles.panel}>
        <h2>Agreement</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                void load();
              }}
            >
              Retry
            </Button>
          </>
        ) : (
          <p role="status">Loading agreement…</p>
        )}
      </section>
    );
  const agreement = view.agreement;
  const submitted = Boolean(agreement?.snapshot);
  const creator = view.creatorId === userId && !isGuest;
  const mutable = !view.closure && !view.released;
  const unsavedPreparation =
    !agreement ||
    fields.some(([f]) => prepared[f] !== agreement.prepared[f]) ||
    prepared.commitmentKind !== agreement.prepared.commitmentKind ||
    disciplines.some(
      (d) =>
        selected[d] !==
        (agreement.seats[d] ? keyOf(agreement.seats[d]!.nominee) : ""),
    ) ||
    Boolean(blocker.trim());
  const personName = (id: string) =>
    people.find((p) => p.nominee.kind === "member" && p.nominee.userId === id)
      ?.name ||
    Object.values(agreement?.seats ?? {}).find(
      (s) => s?.nominee.kind === "member" && s.nominee.userId === id,
    )?.displayNameAtSelection ||
    id;
  const options = people.map((p) => ({
    value: keyOf(p.nominee),
    label:
      p.name + (p.nominee.kind === "invitation" ? " · Invitation pending" : ""),
  }));
  const outgoing = view.links.find((l) => l.originalId === requestId);
  const incoming = view.links.find((l) => l.replacementId === requestId);
  return (
    <section
      id="agreement"
      aria-labelledby="agreement-heading"
      className={styles.panel}
      aria-busy={busy}
    >
      <header>
        <h2 id="agreement-heading">Agreement</h2>
        <p>
          {view.closure
            ? "Superseded · Exception excluded from measured impact"
            : agreementBlockReason(agreement) || "All three participants agree"}
        </p>
      </header>
      <p className={styles.muted}>
        Agree to the intended work and known feasibility. This does not approve
        an unseen final design.
      </p>
      {incoming && (
        <p>
          Replaces{" "}
          <Link href={`/requests/${incoming.originalId}`}>
            original Request
          </Link>
          {!incoming.confirmedAt
            ? " · Waiting for creator to confirm superseding"
            : ""}
          .
        </p>
      )}
      {outgoing && (
        <p>
          Replacement:{" "}
          <Link href={`/requests/${outgoing.replacementId}`}>
            Open linked Request
          </Link>
          .{" "}
          {outgoing.confirmedAt
            ? "Original confirmed Superseded."
            : "Original not yet superseded."}
        </p>
      )}
      {view.attachments.some((a) => a.sourceId !== requestId) && (
        <section aria-label="Inherited files">
          <h3>Files from original Requests</h3>
          <ul className={styles.seats}>
            {view.attachments
              .filter((a) => a.sourceId !== requestId)
              .map((a) => (
                <li key={a.id}>
                  <span>{a.fileName} · </span>
                  <Link href={`/requests/${a.sourceId}`}>Original Request</Link>
                  <AttachmentDownload attachmentId={a.id} context={{ orgId }} />
                </li>
              ))}
          </ul>
        </section>
      )}
      {view.links.some((l) => l.changedFields.length > 0) && (
        <p>
          Changed fields:{" "}
          {view.links
            .flatMap((l) => l.changedFields)
            .map((f) => contextLabels[f] || f)
            .join(", ")}
        </p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              void load();
              refresh();
            }}
          >
            Reload agreement
          </Button>
        </div>
      )}
      {!submitted && creator && mutable && (
        <form
          className={styles.stack}
          onSubmit={(event) => {
            event.preventDefault();
            void run("prepareAgreement", {
              prepared,
              nominees: Object.fromEntries(
                disciplines.map((d) => [
                  d,
                  people.find((p) => keyOf(p.nominee) === selected[d])
                    ?.nominee ?? null,
                ]),
              ),
              blockers: [
                ...(agreement?.concerns
                  .filter((c) => !c.resolution)
                  .map((c) => ({ seat: c.seat, reason: c.reason })) ?? []),
                ...(blocker.trim()
                  ? [{ seat: blockerSeat, reason: blocker }]
                  : []),
              ],
            });
          }}
        >
          <Select
            label="Commitment"
            value={prepared.commitmentKind}
            onValueChange={(value) =>
              setPrepared({
                ...prepared,
                commitmentKind: value as PreparedAgreement["commitmentKind"],
              })
            }
            options={[
              { value: "discovery", label: "Discovery" },
              { value: "delivery", label: "Delivery" },
            ]}
            disabled={busy}
          />
          <div className={styles.fields}>
            {fields.map(([field, label]) => (
              <Input
                key={field}
                label={label}
                value={prepared[field]}
                maxLength={4000}
                required
                disabled={busy}
                onChange={(event) =>
                  setPrepared({ ...prepared, [field]: event.target.value })
                }
              />
            ))}
          </div>
          <div className={styles.fields}>
            {disciplines.map((d) => (
              <Select
                key={d}
                label={`${names[d]} participant`}
                placeholder="Choose a person or lead"
                value={selected[d]}
                onValueChange={(value) =>
                  setSelected({ ...selected, [d]: value })
                }
                options={options}
                disabled={busy}
              />
            ))}
          </div>
          <p className={styles.muted}>
            Choose three distinct people. Your profile role does not determine a
            seat.
          </p>
          <div className={styles.controls}>
            {isAdmin ? (
              <Link
                href="/settings/members"
                target="_blank"
                rel="noopener noreferrer"
              >
                Invite through Clerk (opens Members in a new tab)
              </Link>
            ) : (
              <span>Missing someone? Ask an admin to invite them.</span>
            )}
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                void loadPeople();
              }}
            >
              Refresh participants
            </Button>
          </div>
          <details>
            <summary>Known feasibility blocker</summary>
            <div className={styles.stack}>
              <Textarea
                label="Blocker"
                value={blocker}
                onChange={(e) => setBlocker(e.target.value)}
                maxLength={4000}
              />
              <Select
                label="Responsible discipline"
                value={blockerSeat}
                onValueChange={(v) => setBlockerSeat(v as Discipline)}
                options={disciplines.map((d) => ({
                  value: d,
                  label: names[d],
                }))}
              />
            </div>
          </details>
          <Button type="submit" loading={busy} variant="secondary">
            Save preparation
          </Button>
        </form>
      )}
      {!submitted && agreement && creator && mutable && (
        <>
          <Button
            disabled={unsavedPreparation}
            loading={busy}
            onClick={() => {
              void run("submitAgreement", {
                commitmentToken: view.commitmentToken,
              });
            }}
          >
            Request agreement
          </Button>
          {unsavedPreparation && (
            <p>Save preparation before requesting agreement.</p>
          )}
        </>
      )}
      {submitted && agreement?.snapshot && (
        <>
          <details className={styles.stack}>
            <summary>Inspect the exact submitted commitment</summary>
            <h3>{agreement.snapshot.request.title}</h3>
            <p>
              {agreement.snapshot.request.reframedProblem ||
                agreement.snapshot.request.description}
            </p>
            <dl className={styles.facts}>
              {fields.map(([f, label]) => (
                <div key={f}>
                  <dt>{label}</dt>
                  <dd>{agreement.snapshot!.prepared[f]}</dd>
                </div>
              ))}
            </dl>
            <p>Commitment: {agreement.snapshot.prepared.commitmentKind}</p>
            <p>
              Request type: {agreement.snapshot.request.requestType || "None"} ·
              Project: {agreement.snapshot.request.projectId || "None"} ·
              Labels:{" "}
              {agreement.snapshot.request.labelKeys?.join(", ") || "None"}
            </p>
            <p>
              Submitted files:{" "}
              {agreement.snapshot.attachmentIds
                .map(
                  (id) =>
                    view.attachments.find((a) => a.id === id)?.fileName ||
                    "Unavailable file",
                )
                .join(", ") || "None"}
            </p>
            <p>
              Original description: {agreement.snapshot.request.description}
            </p>
            {(
              [
                "affectedPeople",
                "desiredChange",
                "observedEvidence",
                "uncertainty",
                "extractedSolution",
                "usefulLink",
              ] as const
            ).map((f) =>
              agreement.snapshot!.request[f] ? (
                <p key={f}>
                  {contextLabels[f]}: {agreement.snapshot!.request[f]}
                </p>
              ) : null,
            )}
            {agreement.snapshot.request.expectedImpact && (
              <ExpectedImpactSummary
                id="agreement-impact"
                impact={agreement.snapshot.request.expectedImpact}
              />
            )}
            <p>
              Submitted by {personName(agreement.submittedBy!)} on{" "}
              {new Date(agreement.submittedAt!).toLocaleString()}.
            </p>
          </details>
          <ul className={styles.seats}>
            {disciplines.map((d) => {
              const seat = agreement.seats[d];
              const mine = view.eligibleSeats.includes(d);
              return (
                <li key={d}>
                  <h3>{names[d]}</h3>
                  <p>
                    {seat?.displayNameAtSelection || "Unassigned"} ·{" "}
                    {seat?.nominee.kind === "invitation"
                      ? `Invitation ${view.invitationStates[d] || "pending"}`
                      : seat?.decision?.kind === "agree"
                        ? "Agreed"
                        : seat?.decision?.kind === "withdraw"
                          ? "Withdrawn"
                          : seat?.decision?.kind === "request_changes"
                            ? "Changes requested"
                            : "Awaiting agreement"}
                  </p>
                  {seat?.decision?.reason && <p>{seat.decision.reason}</p>}
                  {mine && !isGuest && mutable && seat && (
                    <div className={styles.controls}>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          void run("decideAgreement", {
                            seat: d,
                            generation: seat.generation,
                            kind: "agree",
                            reason: "",
                          });
                        }}
                      >
                        Agree as {names[d]}
                      </Button>
                      <Button
                        disabled={busy || !reason.trim()}
                        variant="secondary"
                        onClick={() => {
                          void run("decideAgreement", {
                            seat: d,
                            generation: seat.generation,
                            kind: "request_changes",
                            reason,
                          });
                        }}
                      >
                        Request changes
                      </Button>
                      {seat.decision?.kind === "agree" && (
                        <Button
                          disabled={busy || !reason.trim()}
                          variant="secondary"
                          onClick={() => {
                            void run("decideAgreement", {
                              seat: d,
                              generation: seat.generation,
                              kind: "withdraw",
                              reason,
                            });
                          }}
                        >
                          Withdraw agreement
                        </Button>
                      )}
                    </div>
                  )}
                  {creator && mutable && (
                    <details>
                      <summary>Replace {names[d]} participant</summary>
                      <div className={styles.stack}>
                        <Select
                          label={`New ${names[d]} participant`}
                          value={selected[d]}
                          onValueChange={(v) =>
                            setSelected({ ...selected, [d]: v })
                          }
                          options={options}
                        />
                        <Checkbox
                          label="Original participant is unavailable"
                          checked={unavailable}
                          onCheckedChange={(v) => setUnavailable(v === true)}
                        />
                        <Button
                          disabled={busy || !reason.trim() || !selected[d]}
                          variant="secondary"
                          onClick={() => {
                            void run("replaceAgreementParticipant", {
                              seat: d,
                              nominee: people.find(
                                (p) => keyOf(p.nominee) === selected[d],
                              )?.nominee,
                              reason,
                              unavailable,
                            });
                          }}
                        >
                          Replace participant
                        </Button>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {submitted && mutable && !isGuest && (
        <Textarea
          label="Reason or resolution"
          description="Required for requested changes, withdrawal, replacement and resolution."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={4000}
        />
      )}
      {!!agreement?.concerns.length && (
        <section aria-label="Agreement concerns">
          <h3>Concerns</h3>
          <ul className={styles.seats}>
            {agreement.concerns.map((c) => (
              <li key={c.id}>
                <p>
                  {names[c.seat]} · {c.reason}
                </p>
                <p>
                  {c.resolution
                    ? `Resolved by ${c.resolution.actorId}: ${c.resolution.reason}`
                    : `Open · raised by ${c.author}`}
                </p>
                {!c.resolution && !isGuest && mutable && (
                  <Button
                    variant="secondary"
                    disabled={busy || !reason.trim()}
                    onClick={() => {
                      void run("resolveAgreementConcern", {
                        concernId: c.id,
                        reason,
                      });
                    }}
                  >
                    Record resolution
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {creator && submitted && mutable && (
        <details>
          <summary>Corrections and material changes</summary>
          <div className={styles.stack}>
            <p>
              Minor corrections stay beside the original. Scope, impact,
              audience or timing changes need a linked replacement.
            </p>
            <Select
              label="Correction field"
              value={correctionField}
              onValueChange={setCorrectionField}
              options={[
                "title",
                "description",
                "reframedProblem",
                "observedEvidence",
                "uncertainty",
                "extractedSolution",
              ].map((f) => ({ value: f, label: contextLabels[f] }))}
            />
            <Textarea
              label="Corrected wording"
              value={wording}
              onChange={(e) => setWording(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={busy || !reason.trim() || !wording.trim()}
              onClick={() => {
                void run("addAgreementCorrection", {
                  field: correctionField,
                  wording,
                  reason,
                });
              }}
            >
              Add correction
            </Button>
            {!outgoing ? (
              <Button
                variant="secondary"
                disabled={busy || !reason.trim()}
                onClick={() => {
                  void run("createAgreementReplacement", { reason });
                }}
              >
                Create linked replacement
              </Button>
            ) : !outgoing.confirmedAt ? (
              <Button
                variant="danger"
                disabled={busy || !reason.trim()}
                onClick={() => {
                  void run("confirmRequestSuperseded", {
                    replacementId: outgoing.replacementId,
                    reason,
                  });
                }}
              >
                Confirm original as Superseded
              </Button>
            ) : null}
          </div>
        </details>
      )}
      {!!view.history.length && (
        <details>
          <summary>Agreement history</summary>
          <ol className={styles.seats}>
            {view.history.map((e) => (
              <li key={e.id}>
                <p>
                  {e.kind.replaceAll("_", " ")} · {personName(e.actorId)} ·{" "}
                  {new Date(e.at).toLocaleString()}
                </p>
                {e.participantChange && (
                  <p>
                    {names[e.participantChange.seat]}:{" "}
                    {e.participantChange.previousName} →{" "}
                    {e.participantChange.nextName}. {e.participantChange.reason}
                    {e.participantChange.unavailable
                      ? " Original participant recorded as unavailable."
                      : ""}
                  </p>
                )}
                {e.kind === "correction_added" && (
                  <p>
                    Original:{" "}
                    {String(
                      agreement?.snapshot?.request[
                        (
                          e.input as {
                            field: keyof AgreementSnapshot["request"];
                          }
                        ).field
                      ] ?? "None",
                    )}
                    . Corrected{" "}
                    {contextLabels[(e.input as { field: string }).field]}:{" "}
                    {(e.input as { wording: string }).wording} —{" "}
                    {(e.input as { reason: string }).reason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
