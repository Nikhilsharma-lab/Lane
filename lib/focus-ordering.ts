import type { Request } from "@/db/schema";

export interface FocusSection {
  key: string;
  label: string;
  color: string;
  requests: Request[];
}

interface FocusOrderingInput {
  allRequests: Request[];
  userId: string;
  myRequestIds: Set<string>;
  validationsPending?: Set<string>;
}

export function buildFocusSections({
  allRequests,
  userId,
  myRequestIds,
  validationsPending = new Set(),
}: FocusOrderingInput): FocusSection[] {
  const sections: FocusSection[] = [];

  // 1. Needs Your Attention — sign-offs, blocks, input needed
  const needsAttention = allRequests.filter((r) => {
    if (validationsPending.has(r.id)) return true;
    if (r.status === "blocked" && myRequestIds.has(r.id)) return true;
    return false;
  });
  if (needsAttention.length > 0) {
    sections.push({
      key: "attention",
      label: "Needs Your Attention",
      color: "#EF4444",
      requests: needsAttention,
    });
  }

  // 2. Active Work — assigned to you, in progress
  const activeStatuses = new Set(["assigned", "in_progress", "in_review"]);
  const activeWork = allRequests.filter(
    (r) =>
      myRequestIds.has(r.id) &&
      activeStatuses.has(r.status) &&
      !needsAttention.includes(r)
  );
  if (activeWork.length > 0) {
    sections.push({
      key: "active",
      label: "Active Work",
      color: "#2E5339",
      requests: activeWork,
    });
  }

  // 3. Recently Updated — subscribed/created with recent activity
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const recentlyUpdated = allRequests.filter(
    (r) =>
      r.updatedAt > threeDaysAgo &&
      (r.requesterId === userId || myRequestIds.has(r.id)) &&
      !needsAttention.includes(r) &&
      !activeWork.includes(r)
  );
  if (recentlyUpdated.length > 0) {
    sections.push({
      key: "recent",
      label: "Recently Updated",
      color: "#6B7280",
      requests: recentlyUpdated.slice(0, 10),
    });
  }

  // 4. Completed — recently shipped
  const completed = allRequests.filter(
    (r) =>
      ["completed", "shipped"].includes(r.status) &&
      r.updatedAt > threeDaysAgo &&
      (r.requesterId === userId || myRequestIds.has(r.id))
  );
  if (completed.length > 0) {
    sections.push({
      key: "completed",
      label: "Completed",
      color: "#9CA3AF",
      requests: completed.slice(0, 5),
    });
  }

  return sections;
}
