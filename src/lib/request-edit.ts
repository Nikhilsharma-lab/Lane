import { requestLabelKeys, sourceRequestType } from "./request-labels";
import * as z from "zod";
import { requestSchema, problemFramingSchema, DESCRIPTION_MAX, formContext, REQUEST_CONTEXT_FIELDS, type RequestInput } from "./request-schema";
import { impactStateOf } from "./request-impact";
import { expectedImpactSchema, incompleteMeasurementSchema, noMeasurableImpactSchema, type ExpectedImpactDraft } from "./request-impact";
import { measurementRequestTypeIssue } from "./request-measurement";
import type { RequestDetail } from "@/components/requests/detail-view";
export const requestEditSchema = z.object({
    ...requestSchema.shape,
    expectedImpact: z.union([expectedImpactSchema, incompleteMeasurementSchema, noMeasurableImpactSchema]).nullable(),
    reframedProblem: problemFramingSchema.nullable(),
    extractedSolution: z.string().trim().max(DESCRIPTION_MAX).nullable(),
}).superRefine((value, context) => {
    if (!value.expectedImpact) return;
    const issue = measurementRequestTypeIssue(value.expectedImpact, sourceRequestType(value));
    if (issue) context.addIssue({ code: "custom", path: ["expectedImpact"], message: issue });
});
/** The Expected impact the edit form opens with: the saved plan, else the saved draft, else the saved "No measurable impact" choice (#153). */
function impactEditDraftOf(request: { expectedImpact?: ExpectedImpactDraft | null; noMeasurableImpactReason?: string | null; measurementDraft?: ExpectedImpactDraft | null }): ExpectedImpactDraft | null {
    const impact = impactStateOf({ expectedImpact: request.expectedImpact ?? null, noMeasurableImpactReason: request.noMeasurableImpactReason ?? null });
    if (impact.kind === "measured") return impact.plan;
    return request.measurementDraft ?? (impact.kind === "operational" ? { kind: "no_measurable_impact" as const, reason: impact.reason } : null);
}
export function requestEditValues(request: Pick<RequestDetail, "title" | "description" | "affectedPeople" | "desiredChange" | "observedEvidence" | "uncertainty" | "usefulLink" | "projectId" | "requestType" | "priority" | "reframedProblem" | "extractedSolution" | "measurementDraft" | "labelKeys"> & { expectedImpact?: ExpectedImpactDraft | null; noMeasurableImpactReason?: string | null }) {
    return {
        title: request.title, description: request.description,
        ...formContext(request),
        labelKeys: requestLabelKeys(request), projectId: request.projectId ?? null, requestType: request.requestType ?? null, priority: request.priority,
        expectedImpact: impactEditDraftOf(request), reframedProblem: request.reframedProblem, extractedSolution: request.extractedSolution,
    };
}
function canonical(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
}
export function requestEditSnapshot(request: Parameters<typeof requestEditValues>[0]) {
    return JSON.stringify(canonical(requestEditValues(request)));
}

/** Source validation for existing Requests; New keeps requestSchema unchanged. */
export const requestEditSourceSchema = z.object({ ...requestSchema.shape, expectedImpact: requestEditSchema.shape.expectedImpact });

/**
 * #280 (B9): whether saving `values` changes the Request's content, which clears every review answer while it is
 * Open. The same fields the database's reset_reviews_on_edit trigger compares: the wording, the context, the Project,
 * the labels, the saved framing and the goal as the Request saves it (an unfinished goal is kept as a draft beside
 * it). Priority is not content.
 */
export function editChangesContent(
    values: Omit<RequestInput, "expectedImpact"> & { expectedImpact?: unknown },
    original: ReturnType<typeof requestEditValues>,
    framing: { reframedProblem: string | null; extractedSolution: string | null },
): boolean {
    const text = (value: string | null | undefined) => value?.trim() ?? "";
    const goal = (value: unknown) => {
        const parsed = expectedImpactSchema.safeParse(value);
        return parsed.success ? JSON.stringify(canonical(parsed.data)) : null;
    };
    return text(values.title) !== text(original.title) || text(values.description) !== text(original.description)
        || REQUEST_CONTEXT_FIELDS.some(field => text(values[field]) !== text(original[field]))
        || (values.projectId ?? null) !== original.projectId
        || JSON.stringify(requestLabelKeys(values)) !== JSON.stringify(original.labelKeys)
        || text(framing.reframedProblem) !== text(original.reframedProblem) || text(framing.extractedSolution) !== text(original.extractedSolution)
        || goal(values.expectedImpact) !== goal(original.expectedImpact);
}

