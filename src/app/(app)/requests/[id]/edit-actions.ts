"use server";
import { REQUEST_CONTEXT_FIELDS } from "@/lib/request-schema";
import { changeable } from "@/lib/request-access";
import { canUseLabels } from "@/lib/label-access";
import { sourceRequestType } from "@/lib/request-labels";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, requests } from "@/db";
import { guardActiveMember } from "@/lib/auth-guard";
import { canUseProject } from "@/lib/project-access";
import { requestEditSchema, requestEditSnapshot } from "@/lib/request-edit";
import { expectedImpactSchema, impactColumnsOf, impactStateOf, impactStateOfChoice, incompleteMeasurementSchema, noMeasurableImpactSchema } from "@/lib/request-impact";
import { verifyTriageToken } from "@/lib/triage-token";
import { framingShape, savedFraming, storedShape } from "@/lib/request-framing";
import { nameReviewResetActor } from "@/lib/request-reviewers";
import { recordExpectedImpactRevision } from "@/lib/request-impact-history";
import { isDeepStrictEqual } from "node:util";
const editSchema = z.object({ snapshot: z.string().max(100000), changes: requestEditSchema, token: z.string().max(100000).optional() });
export async function saveRequestEdits(requestId: string, input: unknown, context: {
    orgId: string;
}): Promise<{
    success: true;
} | {
    error: string;
    sessionExpired?: true;
}> {
    if (!z.uuid().safeParse(requestId).success)
        return { error: "Request unavailable." };
    const auth = await guardActiveMember(context.orgId, "Request unavailable.");
    if ("error" in auth) return auth;
    const parsed = editSchema.safeParse(input);
    if (!parsed.success)
        return { error: parsed.error.issues[0].message };
    const { changes, snapshot, token } = parsed.data;
    try {
        if (!await canUseLabels(changes.labelKeys, auth.orgId, changes.projectId ?? null)) return {error:"A selected label belongs to a different Project or is unavailable. Remove it or restore its Project."};
        if (!await canUseProject(changes.projectId, auth))
            return { error: "This Project is unavailable. Choose another Project." };
        const result = await db.transaction(async (tx) => {
            const [stored] = await tx.select().from(requests).where(and(eq(requests.id, requestId), changeable(auth))).for("update");
            if (!stored)
                return { error: "Request unavailable." };
            if (stored.status !== "open")
                return { error: "Only Open Requests can be edited. This Request has already been picked up." };
            if (requestEditSnapshot(stored) !== snapshot)
                return { error: "This Request changed while you were editing. Close the editor and reload before trying again." };
            // "No measurable impact" (#153) is saved as its reason with no measured plan; choosing a measured result replaces it.
            const choice = noMeasurableImpactSchema.safeParse(changes.expectedImpact);
            const complete = expectedImpactSchema.safeParse(changes.expectedImpact);
            // A null impact never clears a stored choice: only the choice's own reason can change it.
            const storedImpact = impactStateOf(stored);
            if (!complete.success && !choice.success && storedImpact.kind !== "none")
                return { error: storedImpact.kind === "operational" ? "Keep the reason for no measurable impact, or choose a measured result." : "Keep a complete measurement plan for this Request." };
            const partial = changes.expectedImpact === null || choice.success ? null : incompleteMeasurementSchema.safeParse(changes.expectedImpact);
            if (!complete.success && !choice.success && partial && !partial.success)
                return { error: partial.error.issues[0].message };
            const nextState = choice.success ? impactStateOfChoice(choice.data) : complete.success ? { kind: "measured" as const, plan: complete.data } : { kind: "none" as const };
            const impactStorage = { ...impactColumnsOf(nextState), measurementDraft: choice.success || complete.success ? null : partial?.success ? partial.data : null };
            // Changed wording needs a fresh review of this Request, which sets the
            // classification and the suggested change. Unchanged wording keeps the
            // stored judgement; its framing is the person's to reword, never to drop.
            let classification = stored.classification;
            let shape = storedShape(stored);
            let extractedSolution = changes.extractedSolution;
            let missingProblem: string | undefined;
            if (stored.title !== changes.title || stored.description !== changes.description) {
                const review = token ? verifyTriageToken(token, auth, requestId) : null;
                if (!review?.valid || review.payload.title !== changes.title || review.payload.description !== changes.description)
                    return { error: "Review the changed title and description before saving." };
                classification = review.payload.classification;
                shape = framingShape(classification);
                extractedSolution = review.payload.extractedSolution;
                missingProblem = "Describe the problem before saving this Request.";
            }
            const saved = savedFraming(shape, { reframedProblem: changes.reframedProblem, extractedSolution }, missingProblem);
            if (!saved.ok)
                return { error: saved.message };
            // Empty controls represent existing nulls; an unrelated edit must
            // not rewrite historical context merely because the form uses strings.
            const preservedContext = Object.fromEntries(
                REQUEST_CONTEXT_FIELDS
                    .filter(key => stored[key] === null && changes[key] === "")
                    .map(key => [key, null])
            );
            // Content edits reset reviews; the notification names this editor.
            await nameReviewResetActor(tx, auth.userId);
            await tx.update(requests).set({ ...changes, requestType: sourceRequestType(changes), ...preservedContext, ...impactStorage, classification, ...saved.framing }).where(and(eq(requests.id, requestId), changeable(auth), eq(requests.status, "open")));
            // A changed agreed impact (a measured plan or the choice with its reason) is a new revision, kept with its editor and time.
            const impactChanged = !isDeepStrictEqual(impactColumnsOf(storedImpact), JSON.parse(JSON.stringify(impactColumnsOf(nextState))));
            if (impactChanged && nextState.kind === "measured")
                await recordExpectedImpactRevision(tx, { orgId: auth.orgId, requestId, expectedImpact: nextState.plan, authorId: auth.userId });
            else if (impactChanged && nextState.kind === "operational")
                await recordExpectedImpactRevision(tx, { orgId: auth.orgId, requestId, noMeasurableImpactReason: nextState.reason, authorId: auth.userId });
            return { success: true as const };
        });
        // The shared editor closes and announces success before refreshing.
        // Refreshing this route inside the action can remount its editor before
        // the save acknowledgement reaches the client.
        return result;
    }
    catch {
        return { error: "Couldn’t save the Request. Your edits are still here. Try again." };
    }
}
