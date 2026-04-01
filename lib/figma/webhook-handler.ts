import { createHmac } from "crypto";

/**
 * Figma webhook payload shapes.
 * Figma sends different payloads depending on event_type.
 * We care primarily about FILE_UPDATE and FILE_VERSION_UPDATE.
 */
export interface FigmaWebhookPayload {
  event_type: "FILE_UPDATE" | "FILE_VERSION_UPDATE" | "FILE_DELETE" | "LIBRARY_PUBLISH" | string;
  file_key: string;
  file_name?: string;
  passcode?: string;
  timestamp?: string;
  webhook_id?: string;
  // FILE_VERSION_UPDATE only
  version_id?: string;
  label?: string;
  description?: string;
  created_components?: number;
  modified_components?: number;
  deleted_components?: number;
  created_styles?: number;
  modified_styles?: number;
  deleted_styles?: number;
  // Triggering user (present on some event types)
  triggered_by?: {
    id: string;
    handle: string;
    img_url?: string;
  };
}

/**
 * Verify the Figma webhook signature.
 * Figma sends X-Figma-Signature-256: sha256=<hmac>
 * using FIGMA_WEBHOOK_TOKEN as the key and the raw body as the message.
 */
export function verifyFigmaSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  // Timing-safe comparison
  if (expected.length !== signatureHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Extract the Figma file ID from a Figma URL.
 * Handles: figma.com/design/:fileKey/... and figma.com/file/:fileKey/...
 */
export function extractFileIdFromUrl(url: string): string | null {
  const match = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
  return match?.[1] ?? null;
}

/**
 * Build a human-readable change description from the payload.
 */
export function buildChangeDescription(payload: FigmaWebhookPayload): string {
  if (payload.event_type === "FILE_VERSION_UPDATE") {
    const parts: string[] = [];
    if (payload.label) parts.push(`Version: ${payload.label}`);
    if (payload.description) parts.push(payload.description);
    const counts: string[] = [];
    if ((payload.modified_components ?? 0) > 0) counts.push(`${payload.modified_components} components`);
    if ((payload.created_components ?? 0) > 0) counts.push(`${payload.created_components} added`);
    if ((payload.modified_styles ?? 0) > 0) counts.push(`${payload.modified_styles} styles`);
    if (counts.length) parts.push(counts.join(", "));
    return parts.join(" · ") || "Version saved";
  }
  return "File updated";
}
