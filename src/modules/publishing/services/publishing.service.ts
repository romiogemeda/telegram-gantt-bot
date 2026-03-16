import type { Project, Member } from "../../../generated/prisma/client.js";
import type { TelegramAdapter } from "../../../shared/adapters/telegram.adapter.js";
import type { TaskWithRelations } from "../../task-management/index.js";

// ============================================================================
// Publishing Service
// ============================================================================
// Owns: no entities.
// Reads: ProjectLifecycle (Project, Member), TaskManagement (Task).
// Responsibilities: compose & post summary messages to group chats.
// ============================================================================

export class PublishingService {
  constructor(
    private readonly telegram: TelegramAdapter,
    private readonly webAppBaseUrl: string,
  ) {}

  /**
   * Post the project summary with a "View Gantt Chart" button to the
   * group chat (FR-2.2, FR-2.3).
   */
  async publishToGroup(
    project: Project & { members: Member[] },
    tasks: TaskWithRelations[],
  ): Promise<void> {
    if (!project.groupChatId) {
      throw new Error("Project has no group chat assigned");
    }

    const summary = this.composeSummary(project, tasks);
    const webAppUrl = `${this.webAppBaseUrl}?projectId=${project.id}`;

    await this.telegram.sendMessageWithWebApp(
      project.groupChatId,
      summary,
      "📊 View Gantt Chart",
      webAppUrl,
    );
  }

  /**
   * Repost the summary message — called by /showgantt command (FR-2.4).
   */
  async repostSummary(
    project: Project & { members: Member[] },
    tasks: TaskWithRelations[],
    chatId: bigint,
  ): Promise<void> {
    const summary = this.composeSummary(project, tasks);
    const webAppUrl = `${this.webAppBaseUrl}?projectId=${project.id}`;

    await this.telegram.sendMessageWithWebApp(
      chatId,
      summary,
      "📊 View Gantt Chart",
      webAppUrl,
    );
  }

  /**
   * Compose a human-readable summary of the project.
   */
  private composeSummary(
    project: Project & { members: Member[] },
    tasks: TaskWithRelations[],
  ): string {
    const memberList = project.members
      .map((m) => m.telegramUsername ? `${m.displayName} (@${m.telegramUsername})` : m.displayName)
      .join(", ");

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "DONE").length;

    return [
      `<b>📋 ${project.name}</b>`,
      ``,
      `<b>Team:</b> ${memberList}`,
      `<b>Progress:</b> ${doneTasks}/${totalTasks} tasks completed`,
      ``,
      `Tap the button below to view the interactive Gantt chart.`,
    ].join("\n");
  }
}