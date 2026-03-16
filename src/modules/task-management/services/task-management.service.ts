import type { PrismaClient, Task, Member, Todo } from "../../../generated/prisma/client.js";
import type { DomainResult } from "../../../shared/types/domain.js";
import { VALID_STATUS_TRANSITIONS } from "../../../shared/types/domain.js";
import type { TaskInput } from "../../project-lifecycle/schemas/project.schema.js";

/** Prisma interactive-transaction client (subset of PrismaClient). */
export type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// ============================================================================
// TaskManagement Service
// ============================================================================
// Owns: Task, TaskDependency, Todo entities.
// Responsibilities: task CRUD, status transitions (state machine), todos.
// ============================================================================

/** Full task with relations, returned by read operations. */
export type TaskWithRelations = Task & {
  todos: Todo[];
  dependsOn: { dependsOnTaskId: string }[];
};

export class TaskManagementService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create tasks for a project. Called by ProjectLifecycle during project
   * creation via callback (respects module boundary — ProjectLifecycle
   * doesn't directly access Task tables).
   *
   * When called from inside a Prisma interactive transaction, pass the
   * transaction client as `tx` so that all writes share the same
   * transaction and the project row is visible.
   */
  async createTasks(
    projectId: string,
    members: Member[],
    taskInputs: TaskInput[],
    tx?: TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const memberByName = new Map(members.map((m) => [m.displayName, m]));

    // First pass: create all tasks so we have IDs for dependencies
    const createdTasks = new Map<string, string>(); // title → id
    for (let i = 0; i < taskInputs.length; i++) {
      const input = taskInputs[i];
      const assignee = memberByName.get(input.assignee);

      const task = await db.task.create({
        data: {
          projectId,
          title: input.title,
          assigneeId: assignee?.id ?? null,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          sortOrder: i,
        },
      });

      createdTasks.set(input.title, task.id);

      // Create todos
      if (input.todos.length > 0) {
        await db.todo.createMany({
          data: input.todos.map((todo, j) => ({
            taskId: task.id,
            title: todo.title,
            sortOrder: j,
          })),
        });
      }
    }

    // Second pass: create dependency relationships
    for (const input of taskInputs) {
      const taskId = createdTasks.get(input.title);
      if (!taskId) continue;

      for (const depTitle of input.dependencies) {
        const depId = createdTasks.get(depTitle);
        if (!depId) continue;

        await db.taskDependency.create({
          data: { taskId, dependsOnTaskId: depId },
        });
      }
    }
  }

  /**
   * Get all tasks for a project (used by the Mini App Gantt view).
   */
  async getTasksByProject(projectId: string): Promise<TaskWithRelations[]> {
    return this.prisma.task.findMany({
      where: { projectId },
      include: {
        todos: { orderBy: { sortOrder: "asc" } },
        dependsOn: { select: { dependsOnTaskId: true } },
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * Update a task's status with state machine validation (FR-3.4).
   *
   * Enforces: TODO → IN_PROGRESS → DONE (no skips, no reversals).
   * Returns the previous and new status for notification purposes.
   */
  async updateTaskStatus(
    taskId: string,
    newStatus: string,
  ): Promise<DomainResult<{ task: Task; previousStatus: string }>> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return { ok: false, error: "Task not found", code: "NOT_FOUND" };
    }

    const allowed = VALID_STATUS_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return {
        ok: false,
        error: `Cannot transition from ${task.status} to ${newStatus}. Allowed: [${allowed?.join(", ") ?? "none"}]`,
        code: "INVALID_TRANSITION",
      };
    }

    const previousStatus = task.status;
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus as Task["status"] },
    });

    return { ok: true, data: { task: updated, previousStatus } };
  }

  /**
   * Toggle a todo's completion status (FR-3.5).
   */
  async toggleTodo(todoId: string): Promise<DomainResult<Todo>> {
    const todo = await this.prisma.todo.findUnique({ where: { id: todoId } });
    if (!todo) {
      return { ok: false, error: "Todo not found", code: "NOT_FOUND" };
    }
    const updated = await this.prisma.todo.update({
      where: { id: todoId },
      data: { isCompleted: !todo.isCompleted },
    });
    return { ok: true, data: updated };
  }
}