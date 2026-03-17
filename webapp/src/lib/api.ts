import type {
  ProjectData,
  Task,
  Todo,
  Member,
  CreateTaskInput,
  UpdateTaskInput,
  CreateMemberInput,
  UpdateMemberInput,
} from "../types/project.js";
import { getTelegram } from "./telegram.js";

// ============================================================================
// API Client
// ============================================================================
// All communication with the WebApp Gateway (backend REST API).
// Every request includes the Telegram initData header for auth (FR-4.2).
// ============================================================================

const API_BASE = "/api/webapp";

function getHeaders(hasBody = false): HeadersInit {
  const tg = getTelegram();
  const headers: Record<string, string> = {
    "X-Telegram-Init-Data": tg?.initData ?? "",
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch full project data (FR-3.1).
 */
export async function fetchProject(projectId: string): Promise<ProjectData> {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    headers: getHeaders(),
  });
  return handleResponse<ProjectData>(res);
}

export interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  members: { id: string; displayName: string }[];
  _count: { tasks: number };
}

/**
 * Fetch all projects for the current user.
 */
export async function fetchProjects(): Promise<{ projects: ProjectListItem[] }> {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: getHeaders(),
  });
  return handleResponse(res);
}

/**
 * Create a new empty project (FR-1.12).
 */
export async function createProject(name: string): Promise<{ ok: boolean; project: { id: string; name: string } }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({ name }),
  });
  return handleResponse(res);
}

/**
 * Update a task's status (FR-3.4).
 */
export async function updateTaskStatus(
  taskId: string,
  projectId: string,
  status: string,
): Promise<{ ok: boolean; task: Task }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/status`, {
    method: "PATCH",
    headers: getHeaders(true),
    body: JSON.stringify({ status, projectId }),
  });
  return handleResponse(res);
}

/**
 * Create a new task (FR-3.6).
 */
export async function createTask(
  projectId: string,
  data: CreateTaskInput,
): Promise<{ ok: boolean; task: Task }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/tasks`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

/**
 * Update a task's full data (FR-3.7).
 */
export async function updateTask(
  taskId: string,
  data: UpdateTaskInput,
): Promise<{ ok: boolean; task: Task }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: "PUT",
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

/**
 * Delete a task (FR-3.8).
 */
export async function deleteTask(
  taskId: string,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return handleResponse(res);
}

/**
 * Add a member to a project (FR-1.9).
 */
export async function addMember(
  projectId: string,
  data: CreateMemberInput,
): Promise<{ ok: boolean; member: Member }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/members`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

/**
 * Update a member's details (FR-1.10).
 */
export async function updateMember(
  memberId: string,
  data: UpdateMemberInput,
): Promise<{ ok: boolean; member: Member }> {
  const res = await fetch(`${API_BASE}/members/${memberId}`, {
    method: "PATCH",
    headers: getHeaders(true),
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

/**
 * Remove a member (FR-1.11).
 */
export async function removeMember(
  memberId: string,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/members/${memberId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return handleResponse(res);
}

/**
 * Toggle a todo's completion (FR-3.5).
 */
export async function toggleTodo(
  todoId: string,
): Promise<{ ok: boolean; todo: Todo }> {
  const res = await fetch(`${API_BASE}/todos/${todoId}/toggle`, {
    method: "PATCH",
    headers: getHeaders(true),
    body: JSON.stringify({}),
  });
  return handleResponse(res);
}

/**
 * Add a todo item to a task (FR-3.9).
 */
export async function addTodoToTask(
  taskId: string,
  title: string,
): Promise<{ ok: boolean; todo: Todo }> {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/todos`, {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({ title }),
  });
  return handleResponse(res);
}

/**
 * Remove a todo item (FR-3.10).
 */
export async function removeTodo(
  todoId: string,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/todos/${todoId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  return handleResponse(res);
}