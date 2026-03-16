import { useEffect, useMemo, useState } from "react";
import { getTelegram } from "./lib/telegram.js";
import { useProject } from "./hooks/useProject.js";
import { ProjectHeader } from "./components/ProjectHeader.js";
import { GanttChart } from "./components/GanttChart.js";
import { TaskDetailSheet } from "./components/TaskDetailSheet.js";
import "./styles.css";

// ============================================================================
// App – Root Component
// ============================================================================
// Orchestrates the Mini App lifecycle:
//   1. Init Telegram WebApp SDK
//   2. Extract projectId from URL
//   3. Fetch project data via useProject hook
//   4. Render ProjectHeader + GanttChart
//   5. Show TaskDetailSheet on task selection
// ============================================================================

export function App() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // ── Init Telegram SDK ───────────────────────────────────────────────
  useEffect(() => {
    const tg = getTelegram();
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  // ── Extract project ID from URL ─────────────────────────────────────
  const projectId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("projectId");
  }, []);

  // ── Data lifecycle ──────────────────────────────────────────────────
  const {
    data,
    loading,
    error,
    advanceTask,
    toggleTodoItem,
    updatingTasks,
    updatingTodos,
  } = useProject(projectId);

  // ── Selected task object ────────────────────────────────────────────
  const selectedTask = useMemo(
    () => (data ? data.tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [data, selectedTaskId],
  );

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <span style={{ color: "var(--hint)", fontSize: 13 }}>Loading project…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <span style={{ fontSize: 28 }}>⚠️</span>
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="app">
      <ProjectHeader projectName={data.project.name} tasks={data.tasks} />

      <GanttChart
        tasks={data.tasks}
        members={data.project.members}
        selectedTaskId={selectedTaskId}
        onSelectTask={(id) => setSelectedTaskId(id)}
        updatingTasks={updatingTasks}
      />

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          members={data.project.members}
          onClose={() => setSelectedTaskId(null)}
          onAdvanceStatus={advanceTask}
          onToggleTodo={toggleTodoItem}
          isUpdating={updatingTasks.has(selectedTask.id)}
          updatingTodos={updatingTodos}
        />
      )}
    </div>
  );
}