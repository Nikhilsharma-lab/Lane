"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, requests } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";
import { canUseProject } from "@/lib/project-access";
import { requestEditSchema, requestEditSnapshot } from "@/lib/request-edit";
import { verifyTriageToken } from "@/lib/triage-token";
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
        if (!await canUseProject(changes.projectId, auth))
            return { error: "This Project is unavailable. Choose another Project." };
        const result = await db.transaction(async (tx) => {
            const [stored] = await tx.select().from(requests).where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId), eq(requests.createdBy, auth.userId))).for("update");
            if (!stored)
                return { error: "Request unavailable." };
            if (stored.status !== "open")
                return { error: "Only Open Requests can be edited. This Request has already been picked up." };
            if (requestEditSnapshot(stored) !== snapshot)
                return { error: "This Request changed while you were editing. Close the editor and reload before trying again." };
            let classification = stored.classification;
            if (stored.title !== changes.title || stored.description !== changes.description) {
                const review = token ? verifyTriageToken(token, auth) : null;
                if (!review?.valid || review.payload.title !== changes.title || review.payload.description !== changes.description)
                    return { error: "Review the changed title and description before saving." };
                classification = review.payload.classification;
            }
            if ((classification === "solution" || classification === "hybrid") && !changes.reframedProblem)
                return { error: "Keep a confirmed problem framing for this Request." };
            await tx.update(requests).set({ ...changes, classification }).where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId), eq(requests.createdBy, auth.userId), eq(requests.status, "open")));
            return { success: true as const };
        });
        if ("success" in result) {
            revalidatePath("/");
            revalidatePath(`/requests/${requestId}`);
        }
        return result;
    }
    catch {
        return { error: "Couldn’t save the Request. Your edits are still here. Try again." };
    }
}
