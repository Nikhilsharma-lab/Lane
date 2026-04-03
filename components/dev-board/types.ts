export type KanbanState = "todo" | "in_progress" | "in_review" | "qa" | "done";

export const KANBAN_STATES: KanbanState[] = [
  "todo",
  "in_progress",
  "in_review",
  "qa",
  "done",
];

export const KANBAN_STATE_LABELS: Record<KanbanState, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  qa: "QA",
  done: "Done",
};

export interface CardData {
  id: string;
  title: string;
  description: string;
  businessContext: string | null;
  priority: string | null;
  requestType: string | null;
  kanbanState: KanbanState;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  assignees: string[];
  deadlineAt: string | null;
  figmaUrl: string | null;
  figmaLockedAt: string | null;
}
