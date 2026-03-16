import type { TaskStatus } from "../types/project.js";
import { STATUS_LABELS } from "../types/project.js";

// ============================================================================
// StatusBadge
// ============================================================================
// Pill-shaped status indicator. Colors adapt to Telegram theme.
// ============================================================================

const STATUS_CONFIG: Record<TaskStatus, { bg: string; fg: string; icon: string }> = {
  TODO: { bg: "var(--status-todo-bg)", fg: "var(--status-todo-fg)", icon: "○" },
  IN_PROGRESS: { bg: "var(--status-wip-bg)", fg: "var(--status-wip-fg)", icon: "◐" },
  DONE: { bg: "var(--status-done-bg)", fg: "var(--status-done-fg)", icon: "●" },
};

interface StatusBadgeProps {
  status: TaskStatus;
  small?: boolean;
}

export function StatusBadge({ status, small }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: small ? "3px" : "5px",
        padding: small ? "2px 7px" : "3px 10px",
        borderRadius: "99px",
        fontSize: small ? "11px" : "12px",
        fontWeight: 600,
        letterSpacing: "0.02em",
        background: config.bg,
        color: config.fg,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: small ? "9px" : "11px" }}>{config.icon}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}