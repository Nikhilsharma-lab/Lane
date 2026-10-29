import { plannedDay } from "@/lib/dates";
import type { ReactNode } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { guardrailComparisonPhrase } from "@/lib/guardrail-comparison";
import { actualText, changeText, goalText, valueText } from "@/lib/impact-presenter";
import type { DefinitionGuardrailUse, DefinitionMainUse, DefinitionUseGroup, DefinitionUseOutcome, DefinitionUses } from "@/lib/impact-read-model";
import { formatRequestCode } from "@/lib/request-code";
import { requestDetailHref } from "@/lib/request-workspace";
import styles from "./definition-uses.module.css";

// #203: the Requests that used a Metric definition, on its page. Everything shown comes from the Impact read model
// (buildDefinitionUses); this file only words it. Nothing is grouped, counted or ranked by person.

const requests = (count: number) => `${count} ${count === 1 ? "Request" : "Requests"}`;

/** A result still waiting reads "Still due", with its due date once released: never zero. */
function waitingText(outcome: Exclude<DefinitionUseOutcome<object>, { kind: "measured" }>): string {
  if (outcome.kind === "closed_without_result") return `Closed without a result: ${outcome.reason}`;
  return outcome.due ? `Still due (${outcome.due.dueLabel}, ${plannedDay(outcome.due.dueDate)})` : "Still due (not released yet)";
}

function Fact({ label, children }: { label: string; children: string }) {
  return <div className={styles.fact}><dt>{label}</dt><dd>{children}</dd></div>;
}

function RequestHead({ use }: { use: DefinitionMainUse | DefinitionGuardrailUse }) {
  return <span className={styles.head}>
    <Link href={requestDetailHref(use.requestId, "all")} className={styles.request}>
      <span className={styles.code}>{formatRequestCode(use.requestNumber)}</span> <span className={styles.title}>{use.title}</span>
    </Link>
    <Badge size="sm">{use.journey}</Badge>
  </span>;
}

function MainUse({ use }: { use: DefinitionMainUse }) {
  const { outcome } = use;
  const result = outcome.kind === "measured" ? outcome.result : null;
  return <li className={styles.use}>
    <RequestHead use={use} />
    <dl className={styles.facts}>
      <Fact label="Goal">{goalText(use.predicted)}</Fact>
      <Fact label="Actual">{outcome.kind === "measured" ? actualText(outcome.result) : waitingText(outcome)}</Fact>
      {result && result.change !== null && <Fact label="Change">{changeText(result.change, result.unit, result.changeUnit)}</Fact>}
    </dl>
  </li>;
}

function GuardrailUse({ use }: { use: DefinitionGuardrailUse }) {
  const { outcome, limit } = use;
  const phrase = guardrailComparisonPhrase[limit.operator];
  const measured = outcome.kind !== "measured" ? waitingText(outcome)
    : outcome.actual === null ? "Not recorded"
    : `${valueText(outcome.actual, limit.unit)}, ${outcome.held ? "within the limit" : "outside the limit"}`;
  return <li className={styles.use}>
    <RequestHead use={use} />
    <dl className={styles.facts}>
      {use.mainMetric && <Fact label="Guarding">{use.mainMetric}</Fact>}
      <Fact label="Limit">{`${phrase[0].toUpperCase()}${phrase.slice(1)} ${valueText(limit.limit, limit.unit)}`}</Fact>
      <Fact label="Measured">{measured}</Fact>
    </dl>
  </li>;
}

function UseSection<Use extends DefinitionMainUse | DefinitionGuardrailUse>({ id, heading, role, empty, groups, item }: {
  id: string; heading: string; role: string; empty: string; groups: DefinitionUseGroup<Use>[]; item: (use: Use) => ReactNode;
}) {
  const count = groups.reduce((sum, group) => sum + group.uses.length, 0);
  return <section aria-labelledby={id}>
    <h4 id={id} className={styles.heading}>{heading} {count > 0 && <span className={styles.count}>{requests(count)}</span>}</h4>
    {count === 0 ? <p className={styles.none}>{empty}</p> : groups.map(group => <div key={group.projectId ?? "none"} className={styles.group}>
      <h5 className={styles.project}>{group.name}</h5>
      <ul className={styles.uses} aria-label={`${group.name}, ${role}`}>{group.uses.map(item)}</ul>
    </div>)}
  </section>;
}

/** Every Request that used one Metric definition, main-metric uses apart from guardrail uses, each grouped by Project. */
export function DefinitionUsesList({ uses }: { uses: DefinitionUses }) {
  if (uses.main.length === 0 && uses.guardrails.length === 0) {
    return <EmptyState icon={<ListChecks data-icon-size="2xl" aria-hidden="true" />} title="No Requests have used this metric yet"
      description="Requests with a goal on it, as the main metric or a guardrail, appear here with their results." />;
  }
  return <div className={styles.sections}>
    <UseSection id="definition-uses-main" heading="As the main metric" role="as the main metric" empty="Not used as the main metric yet."
      groups={uses.main} item={use => <MainUse key={use.requestId} use={use} />} />
    <UseSection id="definition-uses-guardrails" heading="As a guardrail" role="as a guardrail" empty="Not used as a guardrail yet."
      groups={uses.guardrails} item={use => <GuardrailUse key={`${use.requestId}-${use.position}`} use={use} />} />
  </div>;
}
