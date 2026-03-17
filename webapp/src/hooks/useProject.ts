import { useCallback, useEffect, useState } from "react";
import type {
  ProjectData,
  Task,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  CreateMemberInput,
  UpdateMemberInput,
} from "../types/project.js";
import * as api from "../lib/api.js";
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
  /** Create a new task. */
  createTask: (input: CreateTaskInput) => Promise<void>;
  /** Update a task's fields. */
  updateTask: (taskId: string, input: UpdateTaskInput) => Promise<void>;
  /** Delete a task. */
  deleteTask: (taskId: string) => Promise<void>;
  /** Add a new member. */
  addMember: (input: CreateMemberInput) => Promise<void>;
  /** Remove a member. */
  removeMember: (memberId: string) => Promise<void>;
  /** Add a todo item to a task. */
  addTodoToTask: (taskId: string, title: string) => Promise<void>;
  /** Remove a todo item from a task. */
  removeTodo: (taskId: string, todoId: string) => Promise<void>;
  /** Rename the project. */
  renameProject: (name: string) => Promise<void>;
  /** Toggle notifications for the project. */
  toggleNotifications: () => Promise<void>;
  /** Archive the project. Returns true on success. */
  archiveProject: () => Promise<boolean>;
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
    api.fetchProject(projectId)
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
        await api.updateTaskStatus(taskId, data.project.id, newStatus);
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
        await api.toggleTodo(todoId);
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

  // ── Create Task ─────────────────────────────────────────────────────
  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      if (!data) return;

      const tempId = `temp-${Date.now()}`;
      const tempTask: Task = {
        id: tempId,
        projectId: data.project.id,
        title: input.title,
        status: "TODO",
        startDate: input.startDate,
        endDate: input.endDate,
        assigneeId: input.assigneeId,
        sortOrder: data.tasks.length,
        todos: input.todos ? input.todos.map((todo, i) => ({
          id: `temp-todo-${Date.now()}-${i}`,
          title: todo.title,
          isCompleted: false,
          sortOrder: i
        })) : [],
        dependsOn: input.dependsOnTaskIds?.map((id) => ({ dependsOnTaskId: id })) || [],
      };

      const prevTasks = data.tasks;
      setData((d) => (d ? { ...d, tasks: [...d.tasks, tempTask] } : d));

      try {
        const result = await api.createTask(data.project.id, input);
        setData((d) =>
          d
            ? {
                ...d,
                tasks: d.tasks.map((t) => (t.id === tempId ? result.task : t)),
              }
            : d,
        );
        haptic("success");
      } catch (err) {
        setData((d) => (d ? { ...d, tasks: prevTasks } : d));
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Update Task ─────────────────────────────────────────────────────
  const updateTask = useCallback(
    async (taskId: string, input: UpdateTaskInput) => {
      if (!data) return;

      const prevTasks = data.tasks;
      setData((d) =>
        d
          ? {
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      ...input,
                      todos: input.todos
                        ? input.todos.map((todo) => ({
                            id: todo.id || `temp-${Math.random()}`,
                            title: todo.title,
                            isCompleted: false,
                            sortOrder: 0,
                          }))
                        : t.todos,
                      dependsOn: input.dependsOnTaskIds
                        ? input.dependsOnTaskIds.map((id) => ({ dependsOnTaskId: id }))
                        : t.dependsOn,
                    }
                  : t,
              ),
            }
          : d,
      );

      try {
        await api.updateTask(taskId, input);
        haptic("success");
      } catch (err) {
        setData((d) => (d ? { ...d, tasks: prevTasks } : d));
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Delete Task ─────────────────────────────────────────────────────
  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!data) return;

      const prevTasks = data.tasks;
      setData((d) =>
        d ? { ...d, tasks: d.tasks.filter((t) => t.id !== taskId) } : d,
      );

      try {
        await api.deleteTask(taskId);
        haptic("success");
      } catch (err) {
        setData((d) => (d ? { ...d, tasks: prevTasks } : d));
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Add Member ──────────────────────────────────────────────────────
  const addMember = useCallback(
    async (input: CreateMemberInput) => {
      if (!data) return;

      const tempId = `temp-${Date.now()}`;
      const tempMember = {
        id: tempId,
        displayName: input.displayName,
        telegramUsername: input.telegramUsername || null,
      };

      const prevMembers = data.project.members;
      setData((d) =>
        d
          ? {
              ...d,
              project: {
                ...d.project,
                members: [...d.project.members, tempMember],
              },
            }
          : d,
      );

      try {
        const result = await api.addMember(data.project.id, input);
        setData((d) =>
          d
            ? {
                ...d,
                project: {
                  ...d.project,
                  members: d.project.members.map((m) =>
                    m.id === tempId ? result.member : m,
                  ),
                },
              }
            : d,
        );
        haptic("success");
      } catch (err) {
        setData((d) =>
          d
            ? { ...d, project: { ...d.project, members: prevMembers } }
            : d,
        );
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Remove Member ───────────────────────────────────────────────────
  const removeMember = useCallback(
    async (memberId: string) => {
      if (!data) return;

      const prevMembers = data.project.members;
      const prevTasks = data.tasks;

      setData((d) =>
        d
          ? {
              ...d,
              project: {
                ...d.project,
                members: d.project.members.filter((m) => m.id !== memberId),
              },
              tasks: d.tasks.map((t) =>
                t.assigneeId === memberId ? { ...t, assigneeId: null } : t,
              ),
            }
          : d,
      );

      try {
        await api.removeMember(memberId);
        haptic("success");
      } catch (err) {
        setData((d) =>
          d
            ? {
                ...d,
                project: { ...d.project, members: prevMembers },
                tasks: prevTasks,
              }
            : d,
        );
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Add Todo ────────────────────────────────────────────────────────
  const addTodoToTask = useCallback(
    async (taskId: string, title: string) => {
      if (!data) return;

      const tempId = `temp-${Date.now()}`;
      const tempTodo = {
        id: tempId,
        title,
        isCompleted: false,
        sortOrder: 0,
      };

      const prevTasks = data.tasks;
      setData((d) =>
        d
          ? {
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === taskId ? { ...t, todos: [...t.todos, tempTodo] } : t,
              ),
            }
          : d,
      );

      try {
        const result = await api.addTodoToTask(taskId, title);
        setData((d) =>
          d
            ? {
                ...d,
                tasks: d.tasks.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        todos: t.todos.map((todo) =>
                          todo.id === tempId ? result.todo : todo,
                        ),
                      }
                    : t,
                ),
              }
            : d,
        );
        haptic("light");
      } catch (err) {
        setData((d) => (d ? { ...d, tasks: prevTasks } : d));
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Remove Todo ─────────────────────────────────────────────────────
  const removeTodo = useCallback(
    async (taskId: string, todoId: string) => {
      if (!data) return;

      const prevTasks = data.tasks;
      setData((d) =>
        d
          ? {
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, todos: t.todos.filter((todo) => todo.id !== todoId) }
                  : t,
              ),
            }
          : d,
      );

      try {
        await api.removeTodo(todoId);
        haptic("light");
      } catch (err) {
        setData((d) => (d ? { ...d, tasks: prevTasks } : d));
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Rename Project ──────────────────────────────────────────────────
  const renameProject = useCallback(
    async (name: string) => {
      if (!data) return;

      const prevName = data.project.name;
      setData((d) =>
        d
          ? {
              ...d,
              project: { ...d.project, name },
            }
          : d,
      );

      try {
        await api.updateProject(data.project.id, { name });
        haptic("success");
      } catch (err) {
        setData((d) =>
          d
            ? { ...d, project: { ...d.project, name: prevName } }
            : d,
        );
        haptic("error");
        throw err;
      }
    },
    [data],
  );

  // ── Toggle Notifications ────────────────────────────────────────────
  const toggleNotifications = useCallback(async () => {
    if (!data) return;

    const prevEnabled = data.project.settings.notificationsEnabled;
    const newValue = !prevEnabled;

    setData((d) =>
      d
        ? {
            ...d,
            project: {
              ...d.project,
              settings: {
                ...d.project.settings,
                notificationsEnabled: newValue,
              },
            },
          }
        : d,
    );

    try {
      await api.updateProjectSettings(data.project.id, {
        notificationsEnabled: newValue,
      });
      haptic("light");
    } catch (err) {
      setData((d) =>
        d
          ? {
              ...d,
              project: {
                ...d.project,
                settings: {
                  ...d.project.settings,
                  notificationsEnabled: prevEnabled,
                },
              },
            }
          : d,
      );
      haptic("error");
      throw err;
    }
  }, [data]);

  // ── Archive Project ─────────────────────────────────────────────────
  const archiveProject = useCallback(async () => {
    if (!data) return false;

    try {
      await api.archiveProject(data.project.id);
      haptic("success");
      return true;
    } catch (err) {
      haptic("error");
      return false;
    }
  }, [data]);

  return {
    data,
    loading,
    error,
    advanceTask,
    toggleTodoItem,
    createTask,
    updateTask,
    deleteTask,
    addMember,
    removeMember,
    addTodoToTask,
    removeTodo,
    renameProject,
    toggleNotifications,
    archiveProject,
    updatingTasks,
    updatingTodos,
  };
}