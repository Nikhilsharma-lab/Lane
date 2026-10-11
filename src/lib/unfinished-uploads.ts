/**
 * Plan item 2.3 (S3): which files of a just-created Request had not finished
 * uploading, so a reload can say so honestly. File objects cannot survive a
 * reload; this record names them only. It lives in sessionStorage (this tab),
 * scoped to the person and workspace, for 24 hours. No schema library: the
 * composer provider reads it on every route, so it must stay small.
 *
 * Only a record an earlier document left is evidence of a reload. While this
 * document's composer is still uploading, or has just been left, its own record
 * says nothing about lost files, so each record names the document that wrote it.
 */
const VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
const MAX_FILES = 50;

type UploadsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type UnfinishedUpload = { key: string; name: string; attachmentId: string | null };
export type UnfinishedUploads = {
  requestId: string;
  title: string;
  files: UnfinishedUpload[];
  /** The writing document's `performance.timeOrigin`. A write without one stamps this document. */
  origin?: number;
};

/** When this document started loading. A reload starts a new document with a new origin. */
function documentOrigin(): number {
  return typeof performance === "undefined" ? 0 : performance.timeOrigin;
}

/** The same scope as the Intake draft: one person in one workspace. */
export function unfinishedUploadsScope(userId: string, orgId: string): string {
  return `${userId}:${orgId}`;
}

export function unfinishedUploadsKey(scope: string): string {
  return `lane:intake-uploads:v${VERSION}:${scope}`;
}

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

function parse(raw: string, now: number): UnfinishedUploads | null {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== VERSION || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (now - record.savedAt > MAX_AGE_MS || record.savedAt - now > CLOCK_SKEW_MS) return null;
  if (!text(record.requestId, 64) || typeof record.title !== "string" || record.title.length > 400) return null;
  if (!Array.isArray(record.files) || record.files.length === 0 || record.files.length > MAX_FILES) return null;
  const files: UnfinishedUpload[] = [];
  for (const file of record.files as unknown[]) {
    if (!file || typeof file !== "object") return null;
    const { key, name, attachmentId } = file as Record<string, unknown>;
    if (!text(key, 64) || !text(name, 400) || !(attachmentId === null || text(attachmentId, 64))) return null;
    files.push({ key, name, attachmentId });
  }
  const origin = typeof record.origin === "number" && Number.isFinite(record.origin) ? record.origin : undefined;
  return { requestId: record.requestId, title: record.title, files, ...(origin === undefined ? {} : { origin }) };
}

export function readUnfinishedUploads(storage: UploadsStorage, scope: string, now = Date.now()): UnfinishedUploads | null {
  const key = unfinishedUploadsKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const record = parse(raw, now);
    if (!record) storage.removeItem(key);
    return record;
  } catch {
    try { storage.removeItem(key); } catch { /* Storage can be unavailable in privacy-restricted contexts. */ }
    return null;
  }
}

/**
 * The record a reload left behind, or null. A record this document wrote is not
 * one: its composer may still be uploading those files, or has just been left.
 */
export function readLostUploads(storage: UploadsStorage, scope: string, now = Date.now()): UnfinishedUploads | null {
  const record = readUnfinishedUploads(storage, scope, now);
  return record && record.origin !== documentOrigin() ? record : null;
}

export function writeUnfinishedUploads(storage: UploadsStorage, scope: string, record: UnfinishedUploads, now = Date.now()): boolean {
  const { origin = documentOrigin(), ...rest } = record;
  try {
    if (!record.files.length) storage.removeItem(unfinishedUploadsKey(scope));
    else storage.setItem(unfinishedUploadsKey(scope), JSON.stringify({ version: VERSION, savedAt: now, origin, ...rest }));
    return true;
  } catch {
    return false;
  }
}

export function clearUnfinishedUploads(storage: UploadsStorage, scope: string): void {
  try { storage.removeItem(unfinishedUploadsKey(scope)); } catch { /* Storage can be unavailable. */ }
}
