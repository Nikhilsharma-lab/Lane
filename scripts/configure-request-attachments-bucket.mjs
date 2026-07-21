import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { parse } from "dotenv";

const envPath = resolve(
  process.cwd(),
  process.argv[2] ?? ".env.staging.local"
);
const env = parse(readFileSync(envPath));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error(
    `Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in ${envPath}`
  );
}

const bucketId = "request-attachments";
const options = {
  public: false,
  fileSizeLimit: 10 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
    "image/png",
    "image/jpeg",
    "image/webp",
  ],
};

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: buckets, error: listError } =
  await supabase.storage.listBuckets();

if (listError) throw listError;

const existing = buckets.find((bucket) => bucket.id === bucketId);
const result = existing
  ? await supabase.storage.updateBucket(bucketId, options)
  : await supabase.storage.createBucket(bucketId, options);

if (result.error) throw result.error;

const { data: verified, error: verifyError } =
  await supabase.storage.getBucket(bucketId);
if (verifyError || !verified) throw verifyError ?? new Error("Bucket missing");
if (verified.public) throw new Error("Attachment bucket must remain private");

console.log(
  `[storage] ${bucketId} is private with a 10 MB per-file limit on ${new URL(url).hostname}`
);
