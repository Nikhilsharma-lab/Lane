export const GUARDRAIL_OPERATORS = ["less_than", "greater_than", "equal_to", "at_most", "at_least"] as const;
export type GuardrailOperator = typeof GUARDRAIL_OPERATORS[number];
export const GUARDRAIL_COMPARISONS: { value: GuardrailOperator; label: string; symbol: string }[] = [
  { value: "less_than", label: "Less than", symbol: "<" },
  { value: "greater_than", label: "Greater than", symbol: ">" },
  { value: "equal_to", label: "Equal to", symbol: "=" },
  { value: "at_most", label: "Less than or equal to", symbol: "≤" },
  { value: "at_least", label: "Greater than or equal to", symbol: "≥" },
];
export const guardrailComparisonPhrase: Record<GuardrailOperator, string> = {
  less_than: "less than", greater_than: "greater than", equal_to: "equal to",
  at_most: "at or below", at_least: "at or above",
};
