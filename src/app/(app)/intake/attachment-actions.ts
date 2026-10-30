"use server";

import { randomUUID } from "node:crypto";

import { and, count, eq, gt, isNull, or, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { db, requestAttachments, requests } from "@/db";
import { guardCanContribute, type MemberAuth } from "@/lib/auth-guard";
import {
  MAX_ATTACHMENT_FILES,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  validateAttachmentMetadata,
} from "@/lib/request-attachments";
import { blockPath, signUpload, storedObject } from "@/lib/attachment-storage";

const prepareUploadSchema = z.object({
  requestId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});

const attachmentActionSchema = z.object({
  requestId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

export type AttachmentActionFailure = {
  code:
    | "validation"
    | "session_expired"
    | "request_unavailable"
    | "limit_reached"
    | "storage_unavailable"
    | "upload_incomplete";
  message: string;
};

export type PrepareAttachmentResponse =
  | {
      success: true;
      attachmentId: string;
      signedUrl: string;
      mimeType: string;
    }
  | { success: false; error: AttachmentActionFailure };

export type FinalizeAttachmentResponse =
  | { success: true }
  | { success: false; error: AttachmentActionFailure };

export type DiscardAttachmentResponse =
  | { success: true; alreadyUploaded?: boolean }
  | { success: false; error: AttachmentActionFailure };

/** Only the initial guard's explicit expiry marker permits session replay. */
function sessionFailure(): AttachmentActionFailure {
  return { code: "session_expired", message: "Your session ended. Sign in again to finish adding this file." };
}

// The provider returned this URL to our server. Decode only its expiry for
// accounting; it is never an authentication token supplied by a Lane client.
function signedUploadExpiry(signedUrl: string): Date {
  const token = new URL(signedUrl).searchParams.get("token");
  const payload = token?.split(".")[1];
  const exp: unknown = payload && JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp;
  if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp * 1000 <= Date.now()) {
    throw new Error("Storage did not return a valid upload expiration");
  }
  const expires = new Date(exp * 1000);
  if (!Number.isFinite(expires.getTime())) throw new Error("Invalid upload expiration");
  return expires;
}

type AttachmentInput = { requestId: string; attachmentId: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function managedAttachment(connection: typeof db | Transaction, input: AttachmentInput, auth: MemberAuth) {
  const [attachment] = await connection.select({
    id: requestAttachments.id,
    storagePath: requestAttachments.storagePath,
    mimeType: requestAttachments.mimeType,
    sizeBytes: requestAttachments.sizeBytes,
    uploadedAt: requestAttachments.uploadedAt,
    discardedAt: requestAttachments.discardedAt,
    uploadBlockedAt: requestAttachments.uploadBlockedAt,
  }).from(requestAttachments)
    .innerJoin(requests, eq(requestAttachments.requestId, requests.id))
    .where(and(
      eq(requestAttachments.id, input.attachmentId),
      eq(requestAttachments.requestId, input.requestId),
      eq(requestAttachments.orgId, auth.orgId),
      eq(requestAttachments.uploadedBy, auth.userId),
      eq(requests.createdBy, auth.userId),
    )).limit(1);
  return attachment;
}

async function cancelUpload(input: AttachmentInput, auth: MemberAuth): Promise<DiscardAttachmentResponse> {
  const attachment = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.requestId}))`);
    const row = await managedAttachment(tx, input, auth);
    if (row && !row.uploadedAt && !row.discardedAt) {
      await tx.update(requestAttachments).set({ discardedAt: new Date() })
        .where(eq(requestAttachments.id, row.id));
    }
    return row;
  });
  if (!attachment) return { success: true };
  if (attachment.uploadedAt) return { success: true, alreadyUploaded: true };
  if (attachment.uploadBlockedAt) return { success: true };

  // The signed URL can't be revoked, so its path is occupied for good
  // (attachment-storage.ts). Keep the zero-byte object and its row when releasing quota.
  await blockPath(attachment.storagePath, attachment.mimeType);
  await db.update(requestAttachments).set({ uploadBlockedAt: new Date() })
    .where(and(eq(requestAttachments.id, attachment.id), isNull(requestAttachments.uploadedAt)));
  return { success: true };
}

async function canManageRequest(
  requestId: string,
  orgId: string,
  userId: string
) {
  const [request] = await db
    .select({ id: requests.id })
    .from(requests)
    .where(
      and(
        eq(requests.id, requestId),
        eq(requests.orgId, orgId),
        eq(requests.createdBy, userId)
      )
    )
    .limit(1);

  return Boolean(request);
}

export async function prepareAttachmentUpload(
  input: {
    requestId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  },
  context: { orgId: string }
): Promise<PrepareAttachmentResponse> {
  const auth = await guardCanContribute(context.orgId, "Request unavailable.");
  if ("error" in auth) return { success: false, error: auth.sessionExpired ? sessionFailure() : { code: "request_unavailable", message: auth.error } };

  const parsed = prepareUploadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "validation",
        message: "Lane could not read this file safely. Choose it again.",
      },
    };
  }

  const validation = validateAttachmentMetadata({
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
  });
  if (!validation.valid) {
    return {
      success: false,
      error: { code: "validation", message: validation.message },
    };
  }

  if (
    !(await canManageRequest(
      parsed.data.requestId,
      auth.orgId,
      auth.userId
    ))
  ) {
    return {
      success: false,
      error: {
        code: "request_unavailable",
        message: "This Request is no longer available for file uploads.",
      },
    };
  }

  const attachmentId = randomUUID();
  const storagePath = `${auth.orgId}/${parsed.data.requestId}/${attachmentId}`;
  let reservationCreated = false;

  try {
    const reservation = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${parsed.data.requestId}))`
      );

      const [usage] = await tx
        .select({
          fileCount: count(requestAttachments.id),
          totalBytes: sum(requestAttachments.sizeBytes),
        })
        .from(requestAttachments)
        .where(
          and(
            eq(requestAttachments.requestId, parsed.data.requestId),
            eq(requestAttachments.orgId, auth.orgId),
            // Cancelled paths are reusable in quota only after both provider
            // expiry and a confirmed non-overwritable zero-byte placeholder.
            or(
              isNull(requestAttachments.discardedAt),
              isNull(requestAttachments.uploadBlockedAt),
              isNull(requestAttachments.uploadExpiresAt),
              gt(requestAttachments.uploadExpiresAt, new Date()),
            ),
          )
        );

      const fileCount = Number(usage?.fileCount ?? 0);
      const totalBytes = Number(usage?.totalBytes ?? 0);
      if (
        fileCount >= MAX_ATTACHMENT_FILES ||
        totalBytes + validation.metadata.sizeBytes >
          MAX_ATTACHMENTS_TOTAL_BYTES
      ) {
        return false;
      }

      await tx.insert(requestAttachments).values({
        id: attachmentId,
        orgId: auth.orgId,
        requestId: parsed.data.requestId,
        uploadedBy: auth.userId,
        storagePath,
        fileName: validation.metadata.fileName,
        mimeType: validation.metadata.mimeType,
        sizeBytes: validation.metadata.sizeBytes,
      });

      return true;
    });

    if (!reservation) {
      return {
        success: false,
        error: {
          code: "limit_reached",
          message: "Add up to 5 files and keep them together under 25 MB. Recent cancelled uploads may hold space for up to 2 hours.",
        },
      };
    }
    reservationCreated = true;

    const data = await signUpload(storagePath);

    const recorded = await db.update(requestAttachments)
      .set({ uploadExpiresAt: signedUploadExpiry(data.signedUrl) })
      .where(and(eq(requestAttachments.id, attachmentId), eq(requestAttachments.orgId, auth.orgId)))
      .returning({ id: requestAttachments.id });
    if (!recorded.length) throw new Error("Upload reservation no longer exists");

    return {
      success: true,
      attachmentId,
      signedUrl: data.signedUrl,
      mimeType: validation.metadata.mimeType,
    };
  } catch (error) {
    if (reservationCreated) {
      try {
        await db
          .delete(requestAttachments)
          .where(
            and(
              eq(requestAttachments.id, attachmentId),
              eq(requestAttachments.orgId, auth.orgId),
              eq(requestAttachments.requestId, parsed.data.requestId),
              eq(requestAttachments.uploadedBy, auth.userId),
              sql`${requestAttachments.uploadedAt} is null`
            )
          );
      } catch (cleanupError) {
        console.error("[intake/attachments] reservation cleanup failed:", cleanupError);
      }
    }
    console.error("[intake/attachments] prepare failed:", error);
    return {
      success: false,
      error: {
        code: "storage_unavailable",
        message:
          "Lane could not start this upload. The Request is safe. Try the file again.",
      },
    };
  }
}

export async function finalizeAttachmentUpload(
  input: { requestId: string; attachmentId: string },
  context: { orgId: string }
): Promise<FinalizeAttachmentResponse> {
  const auth = await guardCanContribute(context.orgId, "Request unavailable.");
  if ("error" in auth) return { success: false, error: auth.sessionExpired ? sessionFailure() : { code: "request_unavailable", message: auth.error } };

  const parsed = attachmentActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "validation",
        message: "Lane could not verify this upload.",
      },
    };
  }

  const attachment = await managedAttachment(db, parsed.data, auth);

  if (!attachment) {
    return {
      success: false,
      error: {
        code: "request_unavailable",
        message: "Lane could not find this file on the Request.",
      },
    };
  }

  if (attachment.uploadedAt) return { success: true };
  if (attachment.discardedAt) return {
    success: false, error: { code: "upload_incomplete", message: "This upload was cancelled. Choose the file again." },
  };

  try {
    const stored = await storedObject(attachment.storagePath);
    if (
      !stored ||
      stored.size !== attachment.sizeBytes ||
      stored.contentType !== attachment.mimeType
    ) {
      await cancelUpload(parsed.data, auth);
      return {
        success: false,
        error: {
          code: "upload_incomplete",
          message:
            "The file did not arrive completely. The Request is safe. Try the file again.",
        },
      };
    }

    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${parsed.data.requestId}))`);
      const current = await managedAttachment(tx, parsed.data, auth);
      if (!current || current.discardedAt) return {
        success: false as const,
        error: { code: "upload_incomplete" as const, message: "This upload was cancelled. Choose the file again." },
      };
      if (!current.uploadedAt) await tx.update(requestAttachments)
        .set({ uploadedAt: new Date() }).where(eq(requestAttachments.id, current.id));
      return { success: true as const };
    });
  } catch (error) {
    console.error("[intake/attachments] finalize failed:", error);
    return {
      success: false,
      error: {
        code: "upload_incomplete",
        message:
          "Lane could not verify the file. The Request is safe. Try the file again.",
      },
    };
  }
}

export async function discardAttachmentUpload(
  input: { requestId: string; attachmentId: string },
  context: { orgId: string }
): Promise<DiscardAttachmentResponse> {
  const auth = await guardCanContribute(context.orgId, "Request unavailable.");
  if ("error" in auth) return { success: false, error: auth.sessionExpired ? sessionFailure() : { code: "request_unavailable", message: auth.error } };

  const parsed = attachmentActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "validation", message: "Lane could not identify this upload safely." },
    };
  }

  try {
    return await cancelUpload(parsed.data, auth);
  } catch (error) {
    console.error("[intake/attachments] discard failed:", error);
    return {
      success: false,
      error: {
        code: "storage_unavailable",
        message: "Lane could not clear this upload. Your Request is saved. Try again.",
      },
    };
  }
}
