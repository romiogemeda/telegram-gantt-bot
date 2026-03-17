import type { Task, TaskStatus, Member } from "../types/project.js";

// ============================================================================
// ProjectHeader
// ============================================================================
// Shows the project title and a compact progress breakdown by status.
// ============================================================================

interface ProjectHeaderProps {
  projectName: string;
  tasks: Task[];
  members: Member[];
  onManageMembers: () => void;
}

export function ProjectHeader({ 
  projectName, 
  tasks, 
  members, 
  onManageMembers 
}: ProjectHeaderProps) {
  const total = tasks.length;
  const counts: Record<TaskStatus, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const t of tasks) counts[t.status]++;

  const pct = total > 0 ? Math.round((counts.DONE / total) * 100) : 0;

  const stackMembers = members.slice(0, 3);
  const moreCount = members.length - 3;

  return (
    <div className="project-header">
      <div className="project-header-top">
        <h1 className="project-title">{projectName}</h1>
        
        <div className="member-stack" onClick={onManageMembers}>
          {stackMembers.map((m) => (
            <div key={m.id} className="gantt-avatar" style={{ fontSize: "10px" }}>
              {m.displayName.charAt(0).toUpperCase()}
            </div>
          ))}
          {moreCount > 0 && (
            <div className="member-stack-more">+{moreCount}</div>
          )}
        </div>

        <span className="project-pct">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="project-progress-track">
        {counts.DONE > 0 && (
          <div
            className="project-progress-seg done"
            style={{ width: `${(counts.DONE / total) * 100}%` }}
          />
        )}
        {counts.IN_PROGRESS > 0 && (
          <div
            className="project-progress-seg wip"
            style={{ width: `${(counts.IN_PROGRESS / total) * 100}%` }}
          />
        )}
        {counts.TODO > 0 && (
          <div
            className="project-progress-seg todo"
            style={{ width: `${(counts.TODO / total) * 100}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="project-legend">
        <span className="project-legend-item">
          <span className="project-legend-dot done" /> {counts.DONE} Done
        </span>
        <span className="project-legend-item">
          <span className="project-legend-dot wip" /> {counts.IN_PROGRESS} Active
        </span>
        <span className="project-legend-item">
          <span className="project-legend-dot todo" /> {counts.TODO} To Do
        </span>
      </div>
    </div>
  );
}