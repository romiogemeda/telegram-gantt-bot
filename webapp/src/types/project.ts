// ============================================================================
// Mini App Shared Types
// ============================================================================

export interface ProjectData {
  project: Project;
  tasks: Task[];
}

export interface Project {
  id: string;
  name: string;
  status: string;
  settings: { notificationsEnabled: boolean };
  members: Member[];
  createdAt: string;
}

export interface Member {
  id: string;
  displayName: string;
  telegramUsername: string | null;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  startDate: string;
  endDate: string;
  assigneeId: string | null;
  sortOrder: number;
  todos: Todo[];
  dependsOn: { dependsOnTaskId: string }[];
}

export interface Todo {
  id: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
}

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

/** Map of valid forward transitions (mirrors backend state machine). */
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus | null> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: null,
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};