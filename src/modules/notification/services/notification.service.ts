import type { Project, Task } from "../../../generated/prisma/client.js";
import type { TelegramAdapter } from "../../../shared/adapters/telegram.adapter.js";
import type { ProjectSettings } from "../../../shared/types/domain.js";

// ============================================================================
// Notification Service
// ============================================================================
// Owns: no entities.
// Reads: ProjectLifecycle (Project settings), TaskManagement (Task).
// Responsibilities: send status-change notifications to group chats.
//
// FR-4.4 (Refined): Notifications are opt-in via project.settings.
// ============================================================================

export class NotificationService {
  constructor(private readonly telegram: TelegramAdapter) {}

  /**
   * Send a status change notification IF notifications are enabled for
   * the project (FR-4.4 refined).
   *
   * Called synchronously by the WebAppGateway after a successful
   * TaskManagement.updateTaskStatus() call.
   */
  async sendStatusChangeIfEnabled(
    project: Project,
    settings: ProjectSettings,
    task: Task,
    previousStatus: string,
    actorDisplayName: string,
  ): Promise<void> {
    // Gate: check the opt-in setting
    if (!settings.notificationsEnabled) {
      return;
    }

    if (!project.groupChatId) {
      return;
    }

    const statusEmoji = this.getStatusEmoji(task.status);
    const message = `${statusEmoji} <b>${actorDisplayName}</b> has marked '<b>${task.title}</b>' as ${this.formatStatus(task.status)}.`;

    await this.telegram.sendMessage(project.groupChatId, message, {
      parseMode: "HTML",
    });
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case "IN_PROGRESS":
        return "🔄";
      case "DONE":
        return "✅";
      default:
        return "📌";
    }
  }

  private formatStatus(status: string): string {
    switch (status) {
      case "TODO":
        return "To Do";
      case "IN_PROGRESS":
        return "In Progress";
      case "DONE":
        return "Done";
      default:
        return status;
    }
  }
}