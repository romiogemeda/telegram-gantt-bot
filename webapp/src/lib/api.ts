import type { ProjectData, Task, Todo } from "../types/project.js";
import { getTelegram } from "./telegram.js";

// ============================================================================
// API Client
// ============================================================================
// All communication with the WebApp Gateway (backend REST API).
// Every request includes the Telegram initData header for auth (FR-4.2).
// ============================================================================

const API_BASE = "/api/webapp";

function getHeaders(): HeadersInit {
  const tg = getTelegram();
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": tg?.initData ?? "",
  };
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
    headers: getHeaders(),
    body: JSON.stringify({ status, projectId }),
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
    headers: getHeaders(),
    body: JSON.stringify({}),
  });
  return handleResponse(res);
}