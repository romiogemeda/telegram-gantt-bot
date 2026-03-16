import { useCallback, useEffect, useState } from "react";
import type { ProjectData, Task, TaskStatus } from "../types/project.js";
import { fetchProject, updateTaskStatus, toggleTodo } from "../lib/api.js";
import { haptic } from "../lib/telegram.js";

// ============================================================================
// useProject Hook
// ============================================================================
// Manages project data lifecycle: fetch, status updates, todo toggles.
// Applies optimistic updates for instant UI feedback, with rollback on error.
// ============================================================================

interface UseProjectReturn {
  data: ProjectData | null;
  loading: boolean;
  error: string | null;
  /** Advance a task to its next status. */
  advanceTask: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  /** Toggle a todo's completion state. */
  toggleTodoItem: (taskId: string, todoId: string) => Promise<void>;
  /** Currently updating task IDs (for loading indicators). */
  updatingTasks: Set<string>;
  /** Currently updating todo IDs. */
  updatingTodos: Set<string>;
}

export function useProject(projectId: string | null): UseProjectReturn {
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTasks, setUpdatingTasks] = useState<Set<string>>(new Set());
  const [updatingTodos, setUpdatingTodos] = useState<Set<string>>(new Set());

  // ── Fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) {
      setError("No project ID provided.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetchProject(projectId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── Advance Task Status ─────────────────────────────────────────────
  const advanceTask = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      if (!data) return;

      // Optimistic update
      const prevTasks = data.tasks;
      setData((d) =>
        d
          ? {
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === taskId ? { ...t, status: newStatus } : t,
              ),
            }
          : d,
      );
      setUpdatingTasks((s) => new Set(s).add(taskId));

      try {
        await updateTaskStatus(taskId, data.project.id, newStatus);
        haptic("success");
      } catch (err) {
        // Rollback
        setData((d) => (d ? { ...d, tasks: prevTasks } : d));
        haptic("error");
        throw err;
      } finally {
        setUpdatingTasks((s) => {
          const next = new Set(s);
          next.delete(taskId);
          return next;
        });
      }
    },
    [data],
  );

  // ── Toggle Todo ─────────────────────────────────────────────────────
  const toggleTodoItem = useCallback(
    async (taskId: string, todoId: string) => {
      if (!data) return;

      // Optimistic update
      const prevTasks = data.tasks;
      setData((d) =>
        d
          ? {
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      todos: t.todos.map((td) =>
                        td.id === todoId
                          ? { ...td, isCompleted: !td.isCompleted }
                          : td,
                      ),
                    }
                  : t,
              ),
            }
          : d,
      );
      setUpdatingTodos((s) => new Set(s).add(todoId));

      try {
        await toggleTodo(todoId);
        haptic("light");
      } catch {
        // Rollback
        setData((d) => (d ? { ...d, tasks: prevTasks } : d));
        haptic("error");
      } finally {
        setUpdatingTodos((s) => {
          const next = new Set(s);
          next.delete(todoId);
          return next;
        });
      }
    },
    [data],
  );

  return { data, loading, error, advanceTask, toggleTodoItem, updatingTasks, updatingTodos };
}