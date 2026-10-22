import "server-only";
import { REQUEST_ATTACHMENTS_BUCKET } from "./request-attachments";
import { createServiceClient } from "./supabase/admin";

/**
 * The private Request attachments bucket: every Storage call Lane makes goes
 * through here. Failures throw; callers decide what the person is told.
 */
const bucket = () => createServiceClient().storage.from(REQUEST_ATTACHMENTS_BUCKET);

/** A one-time upload capability for `path`. Never overwrites a stored object. */
export async function signUpload(path: string): Promise<{ signedUrl: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw error ?? new Error("Storage did not return a signed upload URL");
  return { signedUrl: data.signedUrl };
}

/** A 60-second download link that keeps the file's name. */
export async function signDownload(path: string, fileName: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, 60, { download: fileName });
  if (error || !data) throw error ?? new Error("Storage did not return a signed download URL");
  return data.signedUrl;
}

/** What Storage holds at `path`, or null when it holds nothing readable. */
export async function storedObject(path: string): Promise<{ size: number; contentType: string | null } | null> {
  const { data, error } = await bucket().info(path);
  if (error || !data) return null;
  return { size: data.size ?? 0, contentType: data.contentType?.toLowerCase() ?? null };
}

/**
 * Cancels an upload capability for good. Deletion cannot revoke a signed URL,
 * so the path is occupied permanently instead: Supabase's object commit lock
 * rejects every old upsert:false capability, even a PUT/TUS request accepted
 * before cancellation and completed later. The private zero-byte object stays;
 * throws unless Storage confirms it.
 */
export async function blockPath(path: string, mimeType: string): Promise<void> {
  const storage = bucket();
  const { error } = await storage.upload(path, new Blob([], { type: mimeType }), { upsert: true, contentType: mimeType });
  if (error) throw error;
  const { data, error: verificationError } = await storage.info(path);
  if (verificationError || !data || data.size !== 0) throw new Error("Storage did not confirm upload cancellation");
}

/** Removes stored files. Their rows are already gone, so the caller logs a failure rather than failing. */
export async function removeObjects(paths: string[]): Promise<{ error: { name: string } | null }> {
  if (!paths.length) return { error: null };
  const { error } = await bucket().remove(paths);
  return { error };
}
