import { useState, useMemo, useEffect } from "react";
import type { Task, Member, CreateTaskInput, UpdateTaskInput } from "../types/project.js";
import { parseDate } from "../lib/dates.js";

interface TaskEditorSheetProps {
  mode: "create" | "edit";
  task?: Task;
  members: Member[];
  existingTasks: Task[];
  onSave: (input: CreateTaskInput | UpdateTaskInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onAddTodo?: (taskId: string, title: string) => Promise<void>;
  onRemoveTodo?: (taskId: string, todoId: string) => Promise<void>;
  onClose: () => void;
}

export function TaskEditorSheet({
  mode,
  task,
  members,
  existingTasks,
  onSave,
  onDelete,
  onAddTodo,
  onRemoveTodo,
  onClose,
}: TaskEditorSheetProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? "");
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [endDate, setEndDate] = useState(task?.endDate ?? "");
  const [dependsOnTaskIds, setDependsOnTaskIds] = useState<string[]>(
    task?.dependsOn.map((d) => d.dependsOnTaskId) ?? []
  );
  
  // Checklist local state (for create mode)
  const [localTodos, setLocalTodos] = useState<{ title: string }[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when task changes
  useEffect(() => {
    if (mode === "edit" && task) {
      setTitle(task.title);
      setAssigneeId(task.assigneeId ?? "");
      setStartDate(task.startDate);
      setEndDate(task.endDate);
      setDependsOnTaskIds(task.dependsOn.map((d) => d.dependsOnTaskId));
    }
  }, [task, mode]);

  const filteredTasks = useMemo(() => {
    return existingTasks.filter((t) => t.id !== task?.id);
  }, [existingTasks, task?.id]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "Title is required";
    if (!startDate) newErrors.startDate = "Start date is required";
    if (!endDate) newErrors.endDate = "End date is required";
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      newErrors.endDate = "End date cannot be before start date";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const data: CreateTaskInput | UpdateTaskInput = {
        title,
        assigneeId: assigneeId || null,
        startDate,
        endDate,
        dependsOnTaskIds,
        ...(mode === "create" ? { todos: localTodos } : {}),
      };
      await onSave(data);
      onClose();
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (window.confirm("Are you sure you want to delete this task?")) {
      setSaving(true);
      try {
        await onDelete();
        onClose();
      } catch (err) {
        setErrors({ submit: err instanceof Error ? err.message : "Delete failed" });
      } finally {
        setSaving(false);
      }
    }
  };

  const toggleDependency = (id: string) => {
    setDependsOnTaskIds((prev) =>
      prev.includes(id) ? prev.filter((tid) => tid !== id) : [...prev, id]
    );
  };

  const handleAddTodo = async () => {
    if (!newTodoTitle.trim()) return;

    if (mode === "edit" && task && onAddTodo) {
      setAddingTodo(true);
      try {
        await onAddTodo(task.id, newTodoTitle.trim());
        setNewTodoTitle("");
      } catch (err) {
        setErrors({ todo: "Failed to add item" });
      } finally {
        setAddingTodo(false);
      }
    } else {
      // Create mode local state
      setLocalTodos([...localTodos, { title: newTodoTitle.trim() }]);
      setNewTodoTitle("");
    }
  };

  const handleRemoveTodo = async (todoId: string, index: number) => {
    if (mode === "edit" && task && onRemoveTodo) {
      try {
        await onRemoveTodo(task.id, todoId);
      } catch (err) {
        setErrors({ todo: "Failed to remove item" });
      }
    } else {
      // Create mode local state
      setLocalTodos(localTodos.filter((_, i) => i !== index));
    }
  };

  const currentTodos = mode === "edit" ? task?.todos ?? [] : localTodos;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 className="sheet-title">{mode === "create" ? "New Task" : "Edit Task"}</h2>
        </div>

        <div className="sheet-field">
          <label className="sheet-label">Title</label>
          <input
            type="text"
            className={`sheet-input ${errors.title ? "error" : ""}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Design UI"
          />
          {errors.title && <span className="sheet-field-error">{errors.title}</span>}
        </div>

        <div className="sheet-field">
          <label className="sheet-label">Assignee</label>
          <select
            className="sheet-select"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <div className="sheet-field" style={{ flex: 1 }}>
            <label className="sheet-label">Start Date</label>
            <input
              type="date"
              className={`sheet-input ${errors.startDate ? "error" : ""}`}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {errors.startDate && <span className="sheet-field-error">{errors.startDate}</span>}
          </div>
          <div className="sheet-field" style={{ flex: 1 }}>
            <label className="sheet-label">End Date</label>
            <input
              type="date"
              className={`sheet-input ${errors.endDate ? "error" : ""}`}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            {errors.endDate && <span className="sheet-field-error">{errors.endDate}</span>}
          </div>
        </div>

        <div className="sheet-field">
          <label className="sheet-label">Depends On</label>
          <div className="sheet-dep-list">
            {filteredTasks.length === 0 ? (
              <div style={{ padding: "12px", color: "var(--hint)", fontSize: 13 }}>
                No other tasks to depend on
              </div>
            ) : (
              filteredTasks.map((t) => (
                <div
                  key={t.id}
                  className={`sheet-dep-item ${dependsOnTaskIds.includes(t.id) ? "selected" : ""}`}
                  onClick={() => toggleDependency(t.id)}
                >
                  <div className="sheet-dep-checkbox">
                    {dependsOnTaskIds.includes(t.id) && (
                      <span className="sheet-dep-checkbox-mark">✓</span>
                    )}
                  </div>
                  <div className="sheet-dep-info">
                    <div className="sheet-dep-title">{t.title}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Checklist Section */}
        <div className="sheet-field">
          <label className="sheet-label">Checklist ({currentTodos.length})</label>
          <div className="sheet-checklist">
            <div className="sheet-checklist-items">
              {currentTodos.length === 0 ? (
                <div className="sheet-checklist-empty">No checklist items</div>
              ) : (
                currentTodos.map((todo, i) => {
                  const id = "id" in todo ? (todo as any).id : `local-${i}`;
                  return (
                    <div key={id} className="sheet-checklist-item">
                      <div className="sheet-checklist-item-text">{todo.title}</div>
                      <button
                        className="sheet-checklist-item-remove"
                        onClick={() => handleRemoveTodo(id, i)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="sheet-checklist-add">
              <input
                type="text"
                className="sheet-input"
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                placeholder="Add checklist item..."
                onKeyDown={(e) => e.key === "Enter" && handleAddTodo()}
              />
              <button
                className="member-add-btn"
                onClick={handleAddTodo}
                disabled={addingTodo || !newTodoTitle.trim()}
                style={{ width: "40px", height: "40px" }}
              >
                +
              </button>
            </div>
            {errors.todo && <div className="sheet-field-error">{errors.todo}</div>}
          </div>
        </div>

        {errors.submit && (
          <div className="sheet-field-error" style={{ marginBottom: "12px", textAlign: "center" }}>
            {errors.submit}
          </div>
        )}

        <button
          className="sheet-action-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <span className="sheet-action-spinner" />
          ) : mode === "create" ? (
            "Create Task"
          ) : (
            "Save Changes"
          )}
        </button>

        {mode === "edit" && onDelete && (
          <button
            className="sheet-delete-btn"
            onClick={handleDelete}
            disabled={saving}
          >
            Delete Task
          </button>
        )}
      </div>
    </>
  );
}
