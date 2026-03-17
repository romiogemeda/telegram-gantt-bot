import { useRef, useMemo, useEffect, useState, Fragment } from "react";
import type { Task, Member, TaskStatus } from "../types/project.js";
import {
  parseDate,
  daysBetween,
  daysFromRef,
  formatShortDate,
  generateDateRange,
  isFirstOfMonth,
  isMonday,
  isToday,
} from "../lib/dates.js";

// ============================================================================
// GanttChart
// ============================================================================
// Horizontal scrollable Gantt timeline with:
//   - Fixed left panel (member labels)
//   - Scrollable right panel (date grid + task bars grouped by member)
//   - Today marker line
//   - Dependency connector lines
//   - Tap-to-select interaction
//
// FR-3.2: Render visual timeline with tasks, durations, assignees.
// FR-3.3: Indicate dependencies and completion status.
// ============================================================================

const DAY_WIDTH = 38; // px per day
const ROW_HEIGHT = 48; // px per member row
const BAR_HEIGHT = 28; // px height of the bar itself
const HEADER_HEIGHT = 52; // px for the date header
const LABEL_WIDTH = 140; // px for the left member label column
const PADDING_DAYS = 2; // extra days before/after

interface GanttChartProps {
  tasks: Task[];
  members: Member[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onTaskDateChange: (taskId: string, newStartDate: string, newEndDate: string) => Promise<void>;
  updatingTasks: Set<string>;
}

interface DragState {
  taskId: string;
  type: "move" | "resize";
  startX: number;
  currentDeltaX: number;
  originalLeft: number;
  originalWidth: number;
}

const BAR_COLORS: Record<TaskStatus, { bg: string; border: string }> = {
  TODO: { bg: "var(--bar-todo)", border: "var(--bar-todo-border)" },
  IN_PROGRESS: { bg: "var(--bar-wip)", border: "var(--bar-wip-border)" },
  DONE: { bg: "var(--bar-done)", border: "var(--bar-done-border)" },
};

export function GanttChart({
  tasks,
  members,
  selectedTaskId,
  onSelectTask,
  onTaskDateChange,
  updatingTasks,
}: GanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  // ── Drag Handlers ─────────────────────────────────────────────────

  const getX = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ("touches" in e) return e.touches[0]?.clientX ?? 0;
    return (e as MouseEvent).clientX;
  };

  const handleDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    task: Task,
    type: "move" | "resize",
    left: number,
    width: number
  ) => {
    e.stopPropagation();
    const x = getX(e);
    setDragState({
      taskId: task.id,
      type,
      startX: x,
      currentDeltaX: 0,
      originalLeft: left,
      originalWidth: width,
    });
  };

  // ── Compute timeline bounds ───────────────────────────────────────
  const { timelineStart, dates, totalDays } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return { timelineStart: now, dates: [now], totalDays: 1 };
    }

    let earliest = Infinity;
    let latest = -Infinity;
    for (const t of tasks) {
      const s = parseDate(t.startDate).getTime();
      const e = parseDate(t.endDate).getTime();
      if (s < earliest) earliest = s;
      if (e > latest) latest = e;
    }

    const start = new Date(earliest);
    start.setUTCDate(start.getUTCDate() - PADDING_DAYS);
    const end = new Date(latest);
    end.setUTCDate(end.getUTCDate() + PADDING_DAYS);

    const dates = generateDateRange(start, end);
    return { timelineStart: start, dates, totalDays: dates.length };
  }, [tasks]);

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const delta = getX(e) - dragState.startX;
      // Snap both types to day boundaries
      const snappedDelta = Math.round(delta / DAY_WIDTH) * DAY_WIDTH;
      setDragState((prev) => (prev ? { ...prev, currentDeltaX: snappedDelta } : null));
    };

    const handleEnd = async () => {
      if (!dragState) return;
      const { taskId, type, currentDeltaX, originalLeft, originalWidth } = dragState;
      const task = tasks.find((t) => t.id === taskId);
      setDragState(null);

      if (!task || currentDeltaX === 0) return;

      let newStartOffset: number;
      let newEndOffset: number;

      if (type === "move") {
        newStartOffset = Math.round((originalLeft + currentDeltaX) / DAY_WIDTH);
        const duration = daysBetween(parseDate(task.startDate), parseDate(task.endDate));
        newEndOffset = newStartOffset + duration - 1;
      } else {
        // Resize
        newStartOffset = Math.round(originalLeft / DAY_WIDTH);
        const newWidth = Math.max(DAY_WIDTH, originalWidth + currentDeltaX);
        newEndOffset = newStartOffset + Math.round(newWidth / DAY_WIDTH) - 1;
      }

      const newStart = new Date(timelineStart);
      newStart.setUTCDate(newStart.getUTCDate() + newStartOffset);
      const newEnd = new Date(timelineStart);
      newEnd.setUTCDate(newEnd.getUTCDate() + newEndOffset);

      await onTaskDateChange(
        taskId,
        newStart.toISOString().slice(0, 10),
        newEnd.toISOString().slice(0, 10)
      );
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [dragState, tasks, timelineStart, onTaskDateChange]);

  // ── Group tasks by member (one row per member) ────────────────────
  const rows = useMemo(() => {
    const grouped = new Map<string | null, Task[]>();
    for (const t of tasks) {
      const key = t.assigneeId ?? null;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(t);
    }

    const result: { member: Member | null; tasks: Task[] }[] = [];
    
    // Add members with their tasks
    for (const m of members) {
      result.push({ member: m, tasks: grouped.get(m.id) ?? [] });
      grouped.delete(m.id);
    }

    // Add unassigned tasks row if any exist
    const unassigned = grouped.get(null);
    if (unassigned && unassigned.length > 0) {
      result.push({ member: null, tasks: unassigned });
    }

    return result;
  }, [tasks, members]);


  // ── Auto-scroll to today on mount ─────────────────────────────────
  useEffect(() => {
    if (!scrollRef.current) return;
    const today = new Date();
    const todayOffset = daysFromRef(timelineStart, today);
    if (todayOffset > 0 && todayOffset < totalDays) {
      const scrollTo = todayOffset * DAY_WIDTH - scrollRef.current.clientWidth / 3;
      scrollRef.current.scrollLeft = Math.max(0, scrollTo);
    }
  }, [timelineStart, totalDays]);

  // ── Build task ID → row index map for dependency lines ────────────
  const taskRowMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, rowIndex) => {
      row.tasks.forEach((t) => map.set(t.id, rowIndex));
    });
    return map;
  }, [rows]);

  const timelineWidth = totalDays * DAY_WIDTH;

  return (
    <div className="gantt-container">
      {/* ── Left panel: member labels ───────────────────────────────── */}
      <div className="gantt-labels" style={{ width: LABEL_WIDTH }}>
        <div className="gantt-label-header" style={{ height: HEADER_HEIGHT }}>
          <span style={{ fontSize: "11px", fontWeight: 600, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Members
          </span>
        </div>
        {rows.map((row, idx) => {
          const key = row.member?.id ?? "unassigned";
          return (
            <div
              key={key}
              className="gantt-label-row"
              style={{ height: ROW_HEIGHT }}
            >
              <div className="gantt-avatar">
                {row.member ? row.member.displayName.charAt(0).toUpperCase() : "?"}
              </div>
              <div className="gantt-label-text" style={{ justifyContent: "center" }}>
                <div className="gantt-label-title" style={{ fontSize: "13px", fontWeight: 500 }}>
                  {row.member?.displayName ?? "Unassigned"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Right panel: scrollable timeline ────────────────────────── */}
      <div 
        className="gantt-scroll" 
        ref={scrollRef}
        style={dragState ? { touchAction: "none", userSelect: "none" } : {}}
      >
        <div className="gantt-timeline" style={{ width: timelineWidth, minHeight: HEADER_HEIGHT + rows.length * ROW_HEIGHT }}>
          {/* Date header */}
          <div className="gantt-date-header" style={{ height: HEADER_HEIGHT }}>
            {dates.map((d, i) => {
              const showMonth = i === 0 || isFirstOfMonth(d);
              const showWeek = isMonday(d);
              return (
                <div
                  key={i}
                  className={`gantt-date-col ${isToday(d) ? "today" : ""} ${showWeek ? "week-start" : ""}`}
                  style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                >
                  {showMonth && (
                    <span className="gantt-month-label">{formatShortDate(d)}</span>
                  )}
                  {showWeek && !showMonth && (
                    <span className="gantt-week-label">{d.getUTCDate()}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grid lines */}
          <div className="gantt-grid" style={{ top: HEADER_HEIGHT }}>
            {dates.map((d, i) => (
              <div
                key={i}
                className={`gantt-gridline ${isMonday(d) ? "week" : ""} ${isFirstOfMonth(d) ? "month" : ""}`}
                style={{ left: i * DAY_WIDTH, height: rows.length * ROW_HEIGHT }}
              />
            ))}
          </div>

          {/* Today marker */}
          {(() => {
            const today = new Date();
            const todayOffset = daysFromRef(timelineStart, today);
            if (todayOffset >= 0 && todayOffset < totalDays) {
              return (
                <div
                  className="gantt-today-line"
                  style={{
                    left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
                    top: HEADER_HEIGHT,
                    height: rows.length * ROW_HEIGHT,
                  }}
                >
                  <div className="gantt-today-dot" />
                </div>
              );
            }
            return null;
          })()}

          {/* Task bars grouped by rows */}
          {rows.map((row, rowIndex) => (
            <Fragment key={row.member?.id ?? "unassigned"}>
              {row.tasks.map((task) => {
                const startDate = parseDate(task.startDate);
                const endDate = parseDate(task.endDate);
                const startOffset = daysFromRef(timelineStart, startDate);
                const duration = daysBetween(startDate, endDate);
                
                const isDragging = dragState?.taskId === task.id;
                const dragLeftOffset = isDragging && dragState.type === "move" ? dragState.currentDeltaX : 0;
                const dragWidthOffset = isDragging && dragState.type === "resize" ? dragState.currentDeltaX : 0;

                const left = startOffset * DAY_WIDTH + dragLeftOffset;
                const width = Math.max(DAY_WIDTH, duration * DAY_WIDTH + dragWidthOffset);
                const top = HEADER_HEIGHT + rowIndex * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
                
                const isSelected = task.id === selectedTaskId;
                const isUpdating = updatingTasks.has(task.id);
                const colors = BAR_COLORS[task.status];

                const totalTodos = task.todos.length;
                const doneTodos = task.todos.filter((td) => td.isCompleted).length;
                const progress =
                  task.status === "DONE"
                    ? 1
                    : task.status === "TODO"
                      ? 0
                      : totalTodos > 0
                        ? doneTodos / totalTodos
                        : 0.5;

                return (
                  <div
                    key={task.id}
                    className={`gantt-bar ${isSelected ? "selected" : ""} ${isUpdating ? "updating" : ""} ${isDragging ? "dragging" : ""}`}
                    style={{
                      position: "absolute",
                      left,
                      top,
                      width,
                      height: BAR_HEIGHT,
                      background: colors.bg,
                      borderLeft: `3px solid ${colors.border}`,
                    }}
                    onMouseDown={(e) => handleDragStart(e, task, "move", startOffset * DAY_WIDTH, duration * DAY_WIDTH)}
                    onTouchStart={(e) => handleDragStart(e, task, "move", startOffset * DAY_WIDTH, duration * DAY_WIDTH)}
                    onClick={(e) => {
                      if (isDragging && dragState.currentDeltaX !== 0) {
                        e.stopPropagation();
                        return;
                      }
                      onSelectTask(task.id);
                    }}
                  >
                    <div
                      className="gantt-bar-progress"
                      style={{
                        width: `${progress * 100}%`,
                        background: colors.border,
                        opacity: 0.15,
                      }}
                    />
                    <span className="gantt-bar-label">{task.title}</span>

                    {/* Resize handle (FR-3.8) */}
                    {isSelected && (
                      <div 
                        className="gantt-bar-resize-handle"
                        onMouseDown={(e) => handleDragStart(e, task, "resize", startOffset * DAY_WIDTH, duration * DAY_WIDTH)}
                        onTouchStart={(e) => handleDragStart(e, task, "resize", startOffset * DAY_WIDTH, duration * DAY_WIDTH)}
                      >
                        <div className="gantt-bar-resize-indicator" />
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}

          {/* Dependency lines */}
          <svg
            className="gantt-deps"
            style={{
              position: "absolute",
              top: HEADER_HEIGHT,
              left: 0,
              width: timelineWidth,
              height: rows.length * ROW_HEIGHT,
              pointerEvents: "none",
            }}
          >
            {tasks.map((task) =>
              task.dependsOn.map(({ dependsOnTaskId }) => {
                const fromRow = taskRowMap.get(dependsOnTaskId);
                const toRow = taskRowMap.get(task.id);
                if (fromRow === undefined || toRow === undefined) return null;

                const fromTask = tasks.find(t => t.id === dependsOnTaskId);
                if (!fromTask) return null;

                const fromEnd =
                  daysFromRef(timelineStart, parseDate(fromTask.endDate)) * DAY_WIDTH +
                  DAY_WIDTH;
                const fromY = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;

                const toStart =
                  daysFromRef(timelineStart, parseDate(task.startDate)) * DAY_WIDTH;
                const toY = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

                const midX = (fromEnd + toStart) / 2;

                return (
                  <g key={`${dependsOnTaskId}-${task.id}`}>
                    <path
                      d={`M ${fromEnd} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toStart} ${toY}`}
                      fill="none"
                      stroke="var(--dep-line)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      opacity={0.5}
                    />
                    <polygon
                      points={`${toStart},${toY} ${toStart - 5},${toY - 3} ${toStart - 5},${toY + 3}`}
                      fill="var(--dep-line)"
                      opacity={0.5}
                    />
                  </g>
                );
              }),
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}