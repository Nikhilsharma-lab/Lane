// The attachment bucket, reached through one interface (#410 Testing Decisions): Supabase Storage's
// request-attachments for staging and production, and a local folder for a rehearsal and the kit's tests. The folder
// is what a rehearsal restores into, so the tests need no fake of their own.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const BUCKET = "request-attachments";

export type StoredObject = Readonly<{ path: string; size: number; contentType: string }>;

export interface Bucket {
  /** Where the bucket is, for the terminal: never a key. */
  readonly description: string;
  /** Every object at any depth, sorted by path. */
  list(): Promise<StoredObject[]>;
}

/** A folder holds each object as a file at its path. Content types live in this file at its root, which isn't an object. */
export const FOLDER_CONTENT_TYPES = ".content-types.json";
const UNKNOWN_TYPE = "application/octet-stream";

export function folderBucket(folder: string): Bucket {
  const types = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(path.join(folder, FOLDER_CONTENT_TYPES), "utf8"));
    } catch {
      return {};
    }
  };
  return {
    description: `the folder ${folder}`,
    async list() {
      const known = types();
      return readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
        .filter((objectPath) => objectPath !== FOLDER_CONTENT_TYPES)
        .sort()
        .map((objectPath) => ({
          path: objectPath,
          size: readFileSync(path.join(folder, objectPath)).length,
          contentType: known[objectPath] ?? UNKNOWN_TYPE,
        }));
    },
  };
}

const PAGE = 1000;

export function supabaseBucket(projectRef: string, secretKey: string): Bucket {
  const storage = createClient(`https://${projectRef}.supabase.co`, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage.from(BUCKET);
  return {
    description: `${BUCKET} in Supabase project ${projectRef}`,
    async list() {
      const objects: StoredObject[] = [];
      const walk = async (prefix: string): Promise<void> => {
        for (let offset = 0; ; offset += PAGE) {
          const { data, error } = await storage.list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
          if (error) throw new Error(`Listing ${BUCKET} failed: ${error.message}`);
          for (const entry of data) {
            const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
            // Storage lists a folder as an entry with no id.
            if (entry.id === null) await walk(objectPath);
            else objects.push({ path: objectPath, size: Number(entry.metadata?.size ?? 0), contentType: String(entry.metadata?.mimetype ?? UNKNOWN_TYPE) });
          }
          if (data.length < PAGE) return;
        }
      };
      await walk("");
      return objects.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },
  };
}
