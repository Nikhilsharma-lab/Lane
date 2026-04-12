import type { WorkspaceRole } from "@/db/schema/workspace-members";
import type { TeamRole } from "@/db/schema/project_members";

export interface SidebarTeam {
  id: string;
  name: string;
  slug: string | null;
  teamRole: TeamRole | null;
  isTeamAdmin: boolean;
  streamCounts: {
    active: number;
    intake: number;
    validation: number;
    archived: number;
    total: number;
  };
}

export interface SidebarPersonal {
  myStreams: number;
  drafts: number;
  inbox: number;
}

export interface SidebarData {
  workspace: {
    id: string;
    name: string;
    slug: string;
    role: WorkspaceRole;
  };
  personal: SidebarPersonal;
  teams: SidebarTeam[];
  user: {
    id: string;
    fullName: string;
    email: string;
  };
}
