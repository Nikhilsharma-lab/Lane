type OrgRole = "pm" | "designer" | "developer" | "lead" | "admin" | null | undefined;
type RequestPhase = "predesign" | "design" | "dev" | "track";

interface AssignmentActor {
  assigneeId: string;
  profileRole?: OrgRole;
}

interface RequestActorContext {
  userId: string;
  profileRole: OrgRole;
  requesterId: string;
  designerOwnerId?: string | null;
  devOwnerId?: string | null;
  assignments?: AssignmentActor[];
}

function isPrivileged(role: OrgRole): boolean {
  return role === "lead" || role === "admin";
}

function isAssignedDesigner(ctx: RequestActorContext): boolean {
  if (ctx.designerOwnerId === ctx.userId) return true;
  return (ctx.assignments ?? []).some(
    (assignment) =>
      assignment.assigneeId === ctx.userId && assignment.profileRole === "designer"
  );
}

function isAssignedDeveloper(ctx: RequestActorContext): boolean {
  if (ctx.devOwnerId === ctx.userId) return true;
  return (ctx.assignments ?? []).some(
    (assignment) =>
      assignment.assigneeId === ctx.userId && assignment.profileRole === "developer"
  );
}

export function canAdvanceRequestPhase(
  phase: RequestPhase,
  ctx: RequestActorContext
): boolean {
  switch (phase) {
    case "predesign":
      return (
        ctx.requesterId === ctx.userId ||
        ctx.profileRole === "pm" ||
        isPrivileged(ctx.profileRole)
      );
    case "design":
      return isPrivileged(ctx.profileRole) || isAssignedDesigner(ctx);
    case "dev":
      return isPrivileged(ctx.profileRole) || isAssignedDeveloper(ctx);
    case "track":
      return (
        ctx.requesterId === ctx.userId ||
        ctx.profileRole === "pm" ||
        isPrivileged(ctx.profileRole)
      );
    default:
      return false;
  }
}

export function canManageKanban(ctx: RequestActorContext): boolean {
  return isPrivileged(ctx.profileRole) || isAssignedDeveloper(ctx);
}

export function canToggleRequestRisk(profileRole: OrgRole): boolean {
  return isPrivileged(profileRole);
}

export function canRecordImpact(ctx: RequestActorContext): boolean {
  return (
    ctx.requesterId === ctx.userId ||
    ctx.profileRole === "pm" ||
    isPrivileged(ctx.profileRole)
  );
}
