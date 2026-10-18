import { z } from "zod";
import { requestSchema, problemFramingSchema, DESCRIPTION_MAX } from "./request-schema";
import type { RequestDetail } from "@/components/requests/detail-view";
export const requestEditSchema = requestSchema.safeExtend({
    reframedProblem: problemFramingSchema.nullable(),
    extractedSolution: z.string().trim().max(DESCRIPTION_MAX).nullable(),
});
export function requestEditValues(request: Pick<RequestDetail, "title" | "description" | "affectedPeople" | "desiredChange" | "observedEvidence" | "uncertainty" | "usefulLink" | "projectId" | "requestType" | "priority" | "expectedImpact" | "reframedProblem" | "extractedSolution">) {
    return {
        title: request.title, description: request.description,
        affectedPeople: request.affectedPeople ?? "", desiredChange: request.desiredChange ?? "",
        observedEvidence: request.observedEvidence ?? "", uncertainty: request.uncertainty ?? "", usefulLink: request.usefulLink ?? "",
        projectId: request.projectId ?? null, requestType: request.requestType ?? null, priority: request.priority,
        expectedImpact: request.expectedImpact ?? null, reframedProblem: request.reframedProblem, extractedSolution: request.extractedSolution,
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
