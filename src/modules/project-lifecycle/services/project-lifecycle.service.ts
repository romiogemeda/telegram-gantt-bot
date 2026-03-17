import type { PrismaClient, Project, Member } from "../../../generated/prisma/client.js";
import type { DomainResult, ProjectSettings } from "../../../shared/types/domain.js";
import {
  projectInputSchema,
  type ProjectInput,
} from "../schemas/project.schema.js";
import { DEFAULT_PROJECT_SETTINGS } from "../../../shared/types/domain.js";
import type { TransactionClient } from "../../task-management/index.js";

// ============================================================================
// ProjectLifecycle Service
// ============================================================================
// Owns: Project, Member entities.
// Responsibilities: creation, editing, archiving, validation, member mgmt.
// ============================================================================

export class ProjectLifecycleService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List all active projects created by a specific user.
   */
  async getProjectsByCreator(creatorTelegramId: bigint): Promise<(Project & { members: Member[]; _count: { tasks: number } })[]> {
    return this.prisma.project.findMany({
      where: {
        creatorTelegramId,
        status: "ACTIVE",
      },
      include: {
        members: true,
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  /**
   * Create a new empty project (no members, no tasks) with default settings (FR-1.12).
   */
  async createEmptyProject(
    name: string,
    creatorTelegramId: bigint,
  ): Promise<DomainResult<Project & { members: Member[] }>> {
    if (!name || name.trim().length === 0) {
      return { ok: false, error: "Project name is required", code: "VALIDATION_ERROR" };
    }

    try {
      const project = await this.prisma.project.create({
        data: {
          name,
          creatorTelegramId,
          settings: { notificationsEnabled: true },
        },
        include: { members: true },
      });

      return { ok: true, data: project };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: `Failed to create empty project: ${message}`, code: "VALIDATION_ERROR" };
    }
  }


  /**
   * Validate and parse a raw JSON payload into a ProjectInput.
   * Returns a DomainResult with structured Zod errors on failure (FR-1.5).
   */
  validateProjectInput(raw: unknown): DomainResult<ProjectInput> {
    const result = projectInputSchema.safeParse(raw);
    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return { ok: false, error: errors, code: "VALIDATION_ERROR" };
    }
    return { ok: true, data: result.data };
  }

  /**
   * Create a full project with members and tasks in a single transaction.
   * Tasks are delegated to the TaskManagement module via the provided callback
   * to respect module boundaries (TaskManagement owns Task entities).
   */
  async createProject(
    input: ProjectInput,
    creatorTelegramId: bigint,
    createTasks: (projectId: string, members: Member[], tasks: ProjectInput["tasks"], tx: TransactionClient) => Promise<void>,
  ): Promise<DomainResult<Project & { members: Member[] }>> {
    try {
      const project = await this.prisma.$transaction(async (tx) => {
        // 1. Create project
        const project = await tx.project.create({
          data: {
            name: input.name,
            creatorTelegramId,
            settings: input.settings as object,
          },
        });

        // 2. Create members
        const members = await Promise.all(
          input.members.map((m) =>
            tx.member.create({
              data: {
                projectId: project.id,
                displayName: m.displayName,
                telegramUsername: m.telegramUsername ?? null,
              },
            }),
          ),
        );

        // 3. Delegate task creation to TaskManagement module
        await createTasks(project.id, members, input.tasks, tx);

        return { ...project, members };
      });

      return { ok: true, data: project };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: `Failed to create project: ${message}`, code: "VALIDATION_ERROR" };
    }
  }

  /**
   * Retrieve a project by ID, including members.
   */
  async getProject(projectId: string): Promise<DomainResult<Project & { members: Member[] }>> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });
    if (!project) {
      return { ok: false, error: "Project not found", code: "NOT_FOUND" };
    }
    return { ok: true, data: project };
  }

  /**
   * Retrieve the active project published to a specific group chat (FR-2.4).
   * Returns the most recently updated active project if multiple exist.
   */
  async getProjectByGroupChatId(
    groupChatId: bigint,
  ): Promise<DomainResult<Project & { members: Member[] }>> {
    const project = await this.prisma.project.findFirst({
      where: { groupChatId, status: "ACTIVE" },
      include: { members: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!project) {
      return { ok: false, error: "No active project found for this group", code: "NOT_FOUND" };
    }
    return { ok: true, data: project };
  }

  /**
   * Set the group chat ID after the creator selects a target group (FR-2.1).
   */
  async setGroupChatId(
    projectId: string,
    groupChatId: bigint,
  ): Promise<DomainResult<Project>> {
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { groupChatId },
    });
    return { ok: true, data: project };
  }

  /**
   * Read project settings (type-safe wrapper over JSONB).
   */
  getSettings(project: Project): ProjectSettings {
    const raw = project.settings as Record<string, unknown> | null;
    return {
      ...DEFAULT_PROJECT_SETTINGS,
      ...raw,
      notificationsEnabled: raw?.notificationsEnabled !== false,
    };
  }

  /**
   * Archive a project (FR-1.8). Soft-delete: sets status to ARCHIVED.
   */
  async archiveProject(
    projectId: string,
    requesterId: bigint,
  ): Promise<DomainResult<Project>> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return { ok: false, error: "Project not found", code: "NOT_FOUND" };
    }
    if (project.creatorTelegramId !== requesterId) {
      return { ok: false, error: "Only the project creator can archive", code: "UNAUTHORIZED" };
    }
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { status: "ARCHIVED" },
    });
    return { ok: true, data: updated };
  }

  /**
   * Add a member to a project (FR-1.9).
   */
  async addMember(
    projectId: string,
    data: { displayName: string; telegramUsername?: string },
  ): Promise<DomainResult<Member>> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.status !== "ACTIVE") {
      return { ok: false, error: "Project not found or inactive", code: "NOT_FOUND" };
    }

    const existing = await this.prisma.member.findFirst({
      where: { projectId, displayName: data.displayName },
    });

    if (existing) {
      return {
        ok: false,
        error: `Member with name "${data.displayName}" already exists in this project`,
        code: "CONFLICT",
      };
    }

    const member = await this.prisma.member.create({
      data: {
        projectId,
        displayName: data.displayName,
        telegramUsername: data.telegramUsername ?? null,
      },
    });

    return { ok: true, data: member };
  }

  /**
   * Update a member's details (FR-1.10).
   */
  async updateMember(
    memberId: string,
    data: { displayName?: string; telegramUsername?: string | null },
  ): Promise<DomainResult<Member>> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return { ok: false, error: "Member not found", code: "NOT_FOUND" };
    }

    if (data.displayName && data.displayName !== member.displayName) {
      const existing = await this.prisma.member.findFirst({
        where: {
          projectId: member.projectId,
          displayName: data.displayName,
          NOT: { id: memberId },
        },
      });

      if (existing) {
        return {
          ok: false,
          error: `Member with name "${data.displayName}" already exists in this project`,
          code: "CONFLICT",
        };
      }
    }

    const updated = await this.prisma.member.update({
      where: { id: memberId },
      data: {
        displayName: data.displayName,
        telegramUsername: data.telegramUsername,
      },
    });

    return { ok: true, data: updated };
  }

  /**
   * Remove a member from a project (FR-1.11).
   */
  async removeMember(memberId: string): Promise<DomainResult<{ id: string }>> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return { ok: false, error: "Member not found", code: "NOT_FOUND" };
    }

    await this.prisma.$transaction(async (tx) => {
      // Unassign tasks before deletion (manual set-null even though schema has onDelete: SetNull)
      await tx.task.updateMany({
        where: { assigneeId: memberId },
        data: { assigneeId: null },
      });

      await tx.member.delete({
        where: { id: memberId },
      });
    });

    return { ok: true, data: { id: memberId } };
  }
}