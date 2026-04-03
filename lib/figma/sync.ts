// lib/figma/sync.ts
import { db } from "@/db";
import { figmaUpdates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractFileIdFromUrl } from "./webhook-handler";

interface FigmaVersion {
  id: string;
  created_at: string;
  label: string | null;
  description: string | null;
  user?: { handle?: string };
}

interface SyncOptions {
  requestId: string;
  figmaUrl: string;
  accessToken: string;
  requestPhase: "design" | "dev" | null;
  postHandoff: boolean;
}

export async function syncFigmaVersions(opts: SyncOptions): Promise<void> {
  const { requestId, figmaUrl, accessToken, requestPhase, postHandoff } = opts;

  const fileKey = extractFileIdFromUrl(figmaUrl);
  if (!fileKey) return;

  let versions: FigmaVersion[];
  try {
    const res = await fetch(
      `https://api.figma.com/v1/files/${fileKey}/versions`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { versions?: FigmaVersion[] };
    versions = data.versions ?? [];
  } catch {
    return;
  }

  // Fetch existing version IDs for this request to dedup
  const existing = await db
    .select({ figmaVersionId: figmaUpdates.figmaVersionId })
    .from(figmaUpdates)
    .where(eq(figmaUpdates.requestId, requestId));

  const existingVersionIds = new Set(
    existing.map((r) => r.figmaVersionId).filter(Boolean)
  );

  const newVersions = versions.filter((v) => !existingVersionIds.has(v.id));
  if (!newVersions.length) return;

  for (const version of newVersions) {
    await db.insert(figmaUpdates).values({
      requestId,
      figmaFileId: fileKey,
      figmaFileUrl: `https://www.figma.com/design/${fileKey}`,
      figmaVersionId: version.id,
      figmaUserHandle: version.user?.handle ?? null,
      updatedAt: new Date(version.created_at),
      changeDescription: version.label
        ? `${version.label}${version.description ? ` — ${version.description}` : ""}`
        : (version.description ?? "File updated"),
      requestPhase,
      postHandoff,
      devReviewed: false,
    });
  }
}
