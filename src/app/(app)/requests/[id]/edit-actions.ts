"use server";
import { changeable } from "@/lib/request-access";
import { canUseLabels } from "@/lib/label-access";
import { labelRequestType } from "@/lib/request-labels";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, requests } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";
import { canUseProject } from "@/lib/project-access";
import { requestEditSchema, requestEditSnapshot } from "@/lib/request-edit";
import { expectedImpactSchema, incompleteMeasurementSchema } from "@/lib/request-impact";
import { verifyTriageToken } from "@/lib/triage-token";
import { framingShape, savedFraming, storedShape } from "@/lib/request-framing";
import { nameReviewResetActor } from "@/lib/request-reviewers";
const editSchema = z.object({ snapshot: z.string().max(100000), changes: requestEditSchema, token: z.string().max(100000).optional() });
export async function saveRequestEdits(requestId: string, input: unknown, context: {
    orgId: string;
}): Promise<{
    success: true;
} | {
    error: string;
}> {
    if (!z.uuid().safeParse(requestId).success)
        return { error: "Request unavailable." };
    const auth = await requireActiveMember(context.orgId);
    if (!auth)
        return { error: "Request unavailable." };
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
            const complete = expectedImpactSchema.safeParse(changes.expectedImpact);
            if (!complete.success && stored.expectedImpact !== null)
                return { error: "Keep a complete measurement plan for this Request." };
            const partial = changes.expectedImpact === null ? null : incompleteMeasurementSchema.safeParse(changes.expectedImpact);
            if (!complete.success && partial && !partial.success)
                return { error: partial.error.issues[0].message };
            const impactStorage = complete.success
                ? { expectedImpact: complete.data, measurementDraft: null }
                : { expectedImpact: null, measurementDraft: partial?.success ? partial.data : null };
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
                (["affectedPeople", "desiredChange", "observedEvidence", "uncertainty", "usefulLink"] as const)
                    .filter(key => stored[key] === null && changes[key] === "")
                    .map(key => [key, null])
            );
            // Content edits reset reviews; the notification names this editor.
            await nameReviewResetActor(tx, auth.userId);
            await tx.update(requests).set({ ...changes, requestType: changes.labelKeys ? labelRequestType(changes.labelKeys) : changes.requestType, ...preservedContext, ...impactStorage, classification, ...saved.framing }).where(and(eq(requests.id, requestId), changeable(auth), eq(requests.status, "open")));
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
