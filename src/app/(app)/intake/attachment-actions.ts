"use server";

import { randomUUID } from "node:crypto";

import { and, count, eq, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { db, requestAttachments, requests } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";
import {
  MAX_ATTACHMENT_FILES,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  REQUEST_ATTACHMENTS_BUCKET,
  validateAttachmentMetadata,
} from "@/lib/request-attachments";
import { createServiceClient } from "@/lib/supabase/admin";

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

function sessionFailure(): AttachmentActionFailure {
  return {
    code: "session_expired",
    message: "Your session ended. Sign in again to finish adding this file.",
  };
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
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionFailure() };

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
            eq(requestAttachments.orgId, auth.orgId)
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
          message: "Add up to 5 files and keep them together under 25 MB.",
        },
      };
    }

    const storage = createServiceClient().storage.from(
      REQUEST_ATTACHMENTS_BUCKET
    );
    const { data, error } = await storage.createSignedUploadUrl(storagePath, {
      upsert: false,
    });

    if (error || !data) {
      await db
        .delete(requestAttachments)
        .where(eq(requestAttachments.id, attachmentId));
      console.error("[intake/attachments] signed upload failed:", error);
      return {
        success: false,
        error: {
          code: "storage_unavailable",
          message:
            "Lane could not start this upload. The Request is safe. Try the file again.",
        },
      };
    }

    return {
      success: true,
      attachmentId,
      signedUrl: data.signedUrl,
      mimeType: validation.metadata.mimeType,
    };
  } catch (error) {
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
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionFailure() };

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

  const [attachment] = await db
    .select({
      id: requestAttachments.id,
      storagePath: requestAttachments.storagePath,
      mimeType: requestAttachments.mimeType,
      sizeBytes: requestAttachments.sizeBytes,
    })
    .from(requestAttachments)
    .innerJoin(requests, eq(requestAttachments.requestId, requests.id))
    .where(
      and(
        eq(requestAttachments.id, parsed.data.attachmentId),
        eq(requestAttachments.requestId, parsed.data.requestId),
        eq(requestAttachments.orgId, auth.orgId),
        eq(requestAttachments.uploadedBy, auth.userId),
        eq(requests.createdBy, auth.userId)
      )
    )
    .limit(1);

  if (!attachment) {
    return {
      success: false,
      error: {
        code: "request_unavailable",
        message: "Lane could not find this file on the Request.",
      },
    };
  }

  try {
    const storage = createServiceClient().storage.from(
      REQUEST_ATTACHMENTS_BUCKET
    );
    const { data, error } = await storage.info(attachment.storagePath);
    const contentType = data?.contentType?.toLowerCase();

    if (
      error ||
      !data ||
      data.size !== attachment.sizeBytes ||
      contentType !== attachment.mimeType
    ) {
      if (data) await storage.remove([attachment.storagePath]);
      await db
        .delete(requestAttachments)
        .where(eq(requestAttachments.id, attachment.id));
      return {
        success: false,
        error: {
          code: "upload_incomplete",
          message:
            "The file did not arrive completely. The Request is safe. Try the file again.",
        },
      };
    }

    await db
      .update(requestAttachments)
      .set({ uploadedAt: new Date() })
      .where(eq(requestAttachments.id, attachment.id));

    return { success: true };
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
): Promise<void> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return;

  const parsed = attachmentActionSchema.safeParse(input);
  if (!parsed.success) return;

  const [attachment] = await db
    .select({
      id: requestAttachments.id,
      storagePath: requestAttachments.storagePath,
    })
    .from(requestAttachments)
    .innerJoin(requests, eq(requestAttachments.requestId, requests.id))
    .where(
      and(
        eq(requestAttachments.id, parsed.data.attachmentId),
        eq(requestAttachments.requestId, parsed.data.requestId),
        eq(requestAttachments.orgId, auth.orgId),
        eq(requestAttachments.uploadedBy, auth.userId),
        eq(requests.createdBy, auth.userId),
        sql`${requestAttachments.uploadedAt} is null`
      )
    )
    .limit(1);

  if (!attachment) return;

  try {
    await createServiceClient()
      .storage.from(REQUEST_ATTACHMENTS_BUCKET)
      .remove([attachment.storagePath]);
  } catch {
    // Best effort: the object may not exist if upload never began.
  }

  await db
    .delete(requestAttachments)
    .where(eq(requestAttachments.id, attachment.id));
}
