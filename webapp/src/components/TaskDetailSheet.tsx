import { useMemo } from "react";
import type { Task, Member, TaskStatus } from "../types/project.js";
import { VALID_TRANSITIONS, STATUS_LABELS } from "../types/project.js";
import { StatusBadge } from "./StatusBadge.js";
import { formatMediumDate, parseDate, daysBetween } from "../lib/dates.js";

// ============================================================================
// TaskDetailSheet
// ============================================================================
// Slide-up bottom sheet showing:
//   - Task title, assignee, date range, status
//   - "Advance status" button (FR-3.4)
//   - Todo checklist (FR-3.5)
//   - Success feedback on update (FR-4.5)
// ============================================================================

interface TaskDetailSheetProps {
  task: Task;
  members: Member[];
  onClose: () => void;
  onAdvanceStatus: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onToggleTodo: (taskId: string, todoId: string) => Promise<void>;
  isUpdating: boolean;
  updatingTodos: Set<string>;
}

const NEXT_ACTION_LABELS: Record<string, string> = {
  IN_PROGRESS: "Start Working",
  DONE: "Mark as Done",
};

export function TaskDetailSheet({
  task,
  members,
  onClose,
  onAdvanceStatus,
  onToggleTodo,
  isUpdating,
  updatingTodos,
}: TaskDetailSheetProps) {
  const assignee = useMemo(
    () => members.find((m) => m.id === task.assigneeId),
    [members, task.assigneeId],
  );

  const nextStatus = VALID_TRANSITIONS[task.status];
  const duration = daysBetween(parseDate(task.startDate), parseDate(task.endDate));
  const completedTodos = task.todos.filter((t) => t.isCompleted).length;

  // Dependency names (resolved from task list — we only have IDs here)
  const depIds = task.dependsOn.map((d) => d.dependsOnTaskId);

  return (
    <>
      {/* Backdrop */}
      <div className="sheet-backdrop" onClick={onClose} />

      {/* Sheet */}
      <div className="sheet">
        {/* Drag handle */}
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="sheet-title">{task.title}</h2>
            {assignee && (
              <div className="sheet-assignee">
                <span className="sheet-assignee-avatar">
                  {assignee.displayName.charAt(0).toUpperCase()}
                </span>
                <span>{assignee.displayName}</span>
              </div>
            )}
          </div>
          <StatusBadge status={task.status} />
        </div>

        {/* Meta row */}
        <div className="sheet-meta">
          <div className="sheet-meta-item">
            <span className="sheet-meta-label">Start</span>
            <span className="sheet-meta-value">
              {formatMediumDate(parseDate(task.startDate))}
            </span>
          </div>
          <div className="sheet-meta-item">
            <span className="sheet-meta-label">End</span>
            <span className="sheet-meta-value">
              {formatMediumDate(parseDate(task.endDate))}
            </span>
          </div>
          <div className="sheet-meta-item">
            <span className="sheet-meta-label">Duration</span>
            <span className="sheet-meta-value">
              {duration} {duration === 1 ? "day" : "days"}
            </span>
          </div>
        </div>

        {/* Dependencies */}
        {depIds.length > 0 && (
          <div className="sheet-section">
            <div className="sheet-section-label">
              Depends on {depIds.length} {depIds.length === 1 ? "task" : "tasks"}
            </div>
          </div>
        )}

        {/* Todos (FR-3.5) */}
        {task.todos.length > 0 && (
          <div className="sheet-section">
            <div className="sheet-section-label">
              Checklist ({completedTodos}/{task.todos.length})
            </div>
            <div className="sheet-section-progress-track">
              <div
                className="sheet-section-progress-fill"
                style={{
                  width:
                    task.todos.length > 0
                      ? `${(completedTodos / task.todos.length) * 100}%`
                      : "0%",
                }}
              />
            </div>
            <div className="sheet-todos">
              {task.todos.map((todo) => {
                const isBusy = updatingTodos.has(todo.id);
                return (
                  <button
                    key={todo.id}
                    type="button"
                    className={`sheet-todo ${todo.isCompleted ? "completed" : ""} ${isBusy ? "busy" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTodo(task.id, todo.id);
                    }}
                    disabled={isBusy}
                  >
                    <span className="sheet-todo-check">
                      {todo.isCompleted ? "✓" : ""}
                    </span>
                    <span className="sheet-todo-text">{todo.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action button (FR-3.4) */}
        {nextStatus && (
          <button
            className="sheet-action-btn"
            onClick={() => onAdvanceStatus(task.id, nextStatus)}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <span className="sheet-action-spinner" />
            ) : (
              <>
                {STATUS_LABELS[nextStatus] === "In Progress" ? "🔄" : "✅"}{" "}
                {NEXT_ACTION_LABELS[nextStatus] ?? `Move to ${STATUS_LABELS[nextStatus]}`}
              </>
            )}
          </button>
        )}

        {task.status === "DONE" && (
          <div className="sheet-done-message">
            ✅ This task is complete
          </div>
        )}
      </div>
    </>
  );
}