import { useMemo, useState, useCallback } from "react";
import { haptic } from "../lib/telegram.js";
import { useProject } from "../hooks/useProject.js";
import { ProjectHeader } from "./ProjectHeader.js";
import { GanttChart } from "./GanttChart.js";
import { TaskDetailSheet } from "./TaskDetailSheet.js";
import { TaskEditorSheet } from "./TaskEditorSheet.js";
import { MemberManagerSheet } from "./MemberManagerSheet.js";
import ProjectSettingsSheet from "./ProjectSettingsSheet.js";
import type { Task } from "../types/project.js";

interface ProjectViewProps {
  projectId: string;
  onBack?: () => void;
}

export const ProjectView: React.FC<ProjectViewProps> = ({
  projectId,
  onBack,
}) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showMemberManager, setShowMemberManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ── Data lifecycle ──────────────────────────────────────────────────
  const {
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
  } = useProject(projectId);

  // ── Handlers ────────────────────────────────────────────────────────

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setEditorMode("edit");
    setSelectedTaskId(null); // Close detail sheet
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditorMode(null);
    setEditingTask(null);
  }, []);

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
        {onBack && (
          <button className="back-btn" onClick={onBack}>
            ← Back to Home
          </button>
        )}
      </div>
    );
  }

  if (!data) return null;

  const hasMembers = data.project.members.length > 0;
  const hasTasks = data.tasks.length > 0;
  const showOnboarding = !hasMembers || !hasTasks;

  return (
    <div className="app">
      {onBack && (
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
      )}

      <ProjectHeader
        projectName={data.project.name}
        tasks={data.tasks}
        members={data.project.members}
        onManageMembers={() => setShowMemberManager(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {showOnboarding ? (
        <div className="onboarding">
          <div className="onboarding-icon">🚀</div>
          <h2 className="onboarding-title">Let's set up your project</h2>
          <p className="onboarding-subtitle">
            Start by adding your team members, then create tasks.
          </p>

          <div className="onboarding-cards">
            <button
              className={`onboarding-card ${hasMembers ? "done" : ""}`}
              onClick={() => setShowMemberManager(true)}
            >
              <span className="onboarding-card-icon">👥</span>
              <div className="onboarding-card-text">
                <div className="onboarding-card-title">Add Team Members</div>
                <div className="onboarding-card-subtitle">
                  Add the people working on this project
                </div>
              </div>
              {hasMembers && <span className="onboarding-card-check">✓</span>}
            </button>

            <button
              className={`onboarding-card ${hasTasks ? "done" : ""} ${
                !hasMembers ? "disabled" : ""
              }`}
              onClick={() => setEditorMode("create")}
            >
              <span className="onboarding-card-icon">📌</span>
              <div className="onboarding-card-text">
                <div className="onboarding-card-title">Add First Task</div>
                <div className="onboarding-card-subtitle">
                  Create tasks with dates and assignees
                </div>
              </div>
              {hasTasks && <span className="onboarding-card-check">✓</span>}
            </button>
          </div>
        </div>
      ) : (
        <GanttChart
          tasks={data.tasks}
          members={data.project.members}
          selectedTaskId={selectedTaskId}
          onSelectTask={(id) => setSelectedTaskId(id)}
          onTaskDateChange={(taskId, start, end) =>
            updateTask(taskId, { startDate: start, endDate: end })
          }
          updatingTasks={updatingTasks}
        />
      )}

      <button
        className="fab-add"
        onClick={() => {
          haptic("light");
          setEditorMode("create");
        }}
      >
        +
      </button>

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          members={data.project.members}
          onClose={() => setSelectedTaskId(null)}
          onAdvanceStatus={advanceTask}
          onToggleTodo={toggleTodoItem}
          onEdit={() => handleEdit(selectedTask)}
          isUpdating={updatingTasks.has(selectedTask.id)}
          updatingTodos={updatingTodos}
        />
      )}

      {editorMode && (
        <TaskEditorSheet
          mode={editorMode}
          task={editingTask ?? undefined}
          members={data.project.members}
          existingTasks={data.tasks}
          onSave={async (input) => {
            if (editorMode === "create") {
              await createTask(input as any);
            } else if (editingTask) {
              await updateTask(editingTask.id, input as any);
            }
          }}
          onDelete={
            editingTask
              ? async () => {
                  await deleteTask(editingTask.id);
                }
              : undefined
          }
          onAddTodo={addTodoToTask}
          onRemoveTodo={removeTodo}
          onClose={handleCloseEditor}
        />
      )}

      {showMemberManager && (
        <MemberManagerSheet
          members={data.project.members}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          onClose={() => setShowMemberManager(false)}
        />
      )}

      {showSettings && (
        <ProjectSettingsSheet
          project={data.project}
          onRename={renameProject}
          onToggleNotifications={toggleNotifications}
          onArchive={archiveProject}
          onClose={() => setShowSettings(false)}
          onArchiveComplete={() => {
            if (onBack) onBack();
            else setShowSettings(false);
          }}
        />
      )}
    </div>
  );
};
