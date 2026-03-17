import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ProjectLifecycleService } from "../../modules/project-lifecycle/index.js";
import type { TaskManagementService } from "../../modules/task-management/index.js";
import type { NotificationService } from "../../modules/notification/index.js";
import { validateInitData, type ValidatedInitData } from "../../shared/utils/validate-init-data.js";

// ============================================================================
// WebApp Gateway
// ============================================================================
// Exposes the HTTP REST API consumed by the Telegram Mini App (React frontend).
// Validates initData on every request (FR-4.2), then dispatches to domain
// module services. Owns NO business logic.
//
// Registers as a Fastify plugin (modular monolith pattern).
// ============================================================================

export interface WebAppGatewayDeps {
  botToken: string;
  projectLifecycle: ProjectLifecycleService;
  taskManagement: TaskManagementService;
  notification: NotificationService;
}

export async function webAppGatewayPlugin(
  fastify: FastifyInstance,
  deps: WebAppGatewayDeps,
): Promise<void> {
  const { botToken, projectLifecycle, taskManagement, notification } = deps;

  // ── Authentication hook ───────────────────────────────────────────────

  /**
   * Validate Telegram initData on every request (FR-4.2).
   * Attaches validated user to the request for downstream handlers.
   */
  fastify.decorateRequest("telegramUser", null);

  fastify.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const initData = request.headers["x-telegram-init-data"] as string;
      
      if (!initData) {
        fastify.log.warn({ headers: request.headers }, "Missing x-telegram-init-data header");
        return reply.status(401).send({ error: "Missing initData" });
      }

      fastify.log.debug({ initDataLength: initData.length }, "Validating initData");

      const user = validateInitData(initData, botToken);
      if (!user) {
        fastify.log.warn("Invalid or expired initData");
        return reply.status(401).send({ error: "Invalid or expired initData" });
      }

      fastify.log.info({ userId: user.userId }, "initData validated successfully");
      (request as FastifyRequest & { telegramUser: ValidatedInitData }).telegramUser = user;
    },
  );

  // ── Routes ────────────────────────────────────────────────────────────

  /**
   * GET /api/webapp/projects
   *
   * List all projects for the authenticated user (creator).
   */
  fastify.get("/projects", async (request, reply) => {
    const user = (request as FastifyRequest & { telegramUser: ValidatedInitData }).telegramUser;
    fastify.log.info({ userId: user.userId }, "Listing user projects");

    const projects = await projectLifecycle.getProjectsByCreator(BigInt(user.userId));
    return reply.send({ projects });
  });

  /**
   * POST /api/webapp/projects
   *
   * Create a new empty project (FR-1.12).
   */
  fastify.post<{ Body: { name: string } }>("/projects", async (request, reply) => {
    const user = (request as FastifyRequest & { telegramUser: ValidatedInitData }).telegramUser;
    const { name } = request.body;
    fastify.log.info({ userId: user.userId, name }, "Creating new empty project");

    const result = await projectLifecycle.createEmptyProject(name, BigInt(user.userId));
    if (!result.ok) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.status(201).send({ ok: true, project: result.data });
  });

  /**
   * GET /api/webapp/projects/:projectId
   *
   * Returns the full project data for the Gantt chart view (FR-3.1).
   */
  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    async (request, reply) => {
      const { projectId } = request.params;
      fastify.log.info({ projectId }, "Fetching project data");

      const projectResult = await projectLifecycle.getProject(projectId);
      if (!projectResult.ok) {
        fastify.log.warn({ projectId, error: projectResult.error }, "Project not found");
        return reply.status(404).send({ error: projectResult.error });
      }

      const tasks = await taskManagement.getTasksByProject(projectId);
      
      fastify.log.info({ 
        projectId, 
        taskCount: tasks.length,
        creatorId: projectResult.data.creatorTelegramId.toString()
      }, "Successfully fetched project and tasks");

      return reply.send({
        project: projectResult.data,
        tasks,
      });
    },
  );

  /**
   * PATCH /api/webapp/projects/:projectId
   * Update project details (name).
   */
  fastify.patch<{
    Params: { projectId: string };
    Body: { name?: string };
  }>("/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params;
    const result = await projectLifecycle.updateProject(projectId, request.body);

    if (!result.ok) {
      const statusCode = result.code === "NOT_FOUND" ? 404 : 400;
      return reply.status(statusCode).send({ error: result.error });
    }

    return reply.send({ ok: true, project: result.data });
  });

  /**
   * PATCH /api/webapp/projects/:projectId/settings
   * Update project settings (notifications).
   */
  fastify.patch<{
    Params: { projectId: string };
    Body: { notificationsEnabled?: boolean };
  }>("/projects/:projectId/settings", async (request, reply) => {
    const { projectId } = request.params;
    const result = await projectLifecycle.updateSettings(projectId, request.body);

    if (!result.ok) {
      return reply.status(404).send({ error: result.error });
    }

    return reply.send({ ok: true, project: result.data });
  });

  /**
   * POST /api/webapp/projects/:projectId/archive
   * Archive/Delete a project.
   */
  fastify.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/archive",
    async (request, reply) => {
      const { projectId } = request.params;
      const user = (request as FastifyRequest & { telegramUser: ValidatedInitData }).telegramUser;

      const result = await projectLifecycle.archiveProject(projectId, BigInt(user.userId));

      if (!result.ok) {
        let statusCode = 400;
        if (result.code === "NOT_FOUND") statusCode = 404;
        if (result.code === "UNAUTHORIZED") statusCode = 403;
        return reply.status(statusCode).send({ error: result.error });
      }

      return reply.send({ ok: true, project: result.data });
    },
  );

  /**
   * PATCH /api/webapp/tasks/:taskId/status
   *
   * Update a task's status (FR-3.4). Triggers notification if enabled.
   * Flow 3 from Phase 3:
   *   WebAppGateway.validateInitData()
   *     → TaskManagement.updateTaskStatus()
   *     → Notification.sendIfEnabled()
   */
  fastify.patch<{
    Params: { taskId: string };
    Body: { status: string; projectId: string };
  }>("/tasks/:taskId/status", async (request, reply) => {
    const { taskId } = request.params;
    const { status: newStatus, projectId } = request.body;
    const user = (request as FastifyRequest & { telegramUser: ValidatedInitData }).telegramUser;

    // 1. Update task status via TaskManagement
    const result = await taskManagement.updateTaskStatus(taskId, newStatus);
    if (!result.ok) {
      const statusCode = result.code === "NOT_FOUND" ? 404 : 400;
      return reply.status(statusCode).send({ error: result.error });
    }

    // 2. Send notification if enabled via Notification module
    const projectResult = await projectLifecycle.getProject(projectId);
    if (projectResult.ok) {
      const settings = projectLifecycle.getSettings(projectResult.data);
      await notification.sendStatusChangeIfEnabled(
        projectResult.data,
        settings,
        result.data.task,
        result.data.previousStatus,
        user.firstName,
      );
    }

    // 3. Return updated task (FR-4.5 — success indicator data)
    return reply.send({
      ok: true,
      task: result.data.task,
    });
  });

  /**
   * PATCH /api/webapp/todos/:todoId/toggle
   *
   * Toggle a todo's completion status (FR-3.5).
   */
  fastify.patch<{ Params: { todoId: string } }>(
    "/todos/:todoId/toggle",
    async (request, reply) => {
      const { todoId } = request.params;
      fastify.log.info({ todoId }, "Toggling todo item");
      
      const result = await taskManagement.toggleTodo(todoId);
      if (!result.ok) {
        fastify.log.warn({ todoId, error: result.error }, "Failed to toggle todo");
        return reply.status(404).send({ error: result.error });
      }

      fastify.log.info({ todoId, isCompleted: result.data.isCompleted }, "Todo toggled successfully");
      return reply.send({ ok: true, todo: result.data });
    },
  );

  // ── Task Management Routes ───────────────────────────────────────────

  /**
   * POST /api/webapp/projects/:projectId/tasks
   * Create a single task (FR-3.6).
   */
  fastify.post<{
    Params: { projectId: string };
    Body: { title: string; assigneeId: string | null; startDate: string; endDate: string; dependsOnTaskIds?: string[] };
  }>("/projects/:projectId/tasks", async (request, reply) => {
    const { projectId } = request.params;
    const result = await taskManagement.createSingleTask(projectId, request.body);

    if (!result.ok) {
      const statusCode = result.code === "NOT_FOUND" ? 404 : 400;
      return reply.status(statusCode).send({ error: result.error });
    }

    return reply.status(201).send({ ok: true, task: result.data });
  });

  /**
   * PUT /api/webapp/tasks/:taskId
   * Update a task's full data (FR-3.7).
   */
  fastify.put<{
    Params: { taskId: string };
    Body: { title?: string; assigneeId?: string | null; startDate?: string; endDate?: string; dependsOnTaskIds?: string[] };
  }>("/tasks/:taskId", async (request, reply) => {
    const { taskId } = request.params;
    const result = await taskManagement.updateTask(taskId, request.body);

    if (!result.ok) {
      const statusCode = result.code === "NOT_FOUND" ? 404 : 400;
      return reply.status(statusCode).send({ error: result.error });
    }

    return reply.send({ ok: true, task: result.data });
  });

  /**
   * DELETE /api/webapp/tasks/:taskId
   * Delete a task (FR-3.8).
   */
  fastify.delete<{ Params: { taskId: string } }>(
    "/tasks/:taskId",
    async (request, reply) => {
      const { taskId } = request.params;
      const result = await taskManagement.deleteTask(taskId);

      if (!result.ok) {
        return reply.status(404).send({ error: result.error });
      }

      return reply.send({ ok: true, id: result.data.id });
    }
  );

  /**
   * POST /api/webapp/tasks/:taskId/todos
   * Add a todo item (FR-3.9).
   */
  fastify.post<{
    Params: { taskId: string };
    Body: { title: string };
  }>("/tasks/:taskId/todos", async (request, reply) => {
    const { taskId } = request.params;
    const result = await taskManagement.addTodoToTask(taskId, request.body.title);

    if (!result.ok) {
      return reply.status(404).send({ error: result.error });
    }

    return reply.status(201).send({ ok: true, todo: result.data });
  });

  /**
   * DELETE /api/webapp/todos/:todoId
   * Remove a todo item (FR-3.10).
   */
  fastify.delete<{ Params: { todoId: string } }>(
    "/todos/:todoId",
    async (request, reply) => {
      const { todoId } = request.params;
      const result = await taskManagement.removeTodo(todoId);

      if (!result.ok) {
        return reply.status(404).send({ error: result.error });
      }

      return reply.send({ ok: true, id: result.data.id });
    }
  );

  // ── Member Management Routes ─────────────────────────────────────────

  /**
   * POST /api/webapp/projects/:projectId/members
   * Add a member to a project (FR-1.9).
   */
  fastify.post<{
    Params: { projectId: string };
    Body: { displayName: string; telegramUsername?: string };
  }>("/projects/:projectId/members", async (request, reply) => {
    const { projectId } = request.params;
    const result = await projectLifecycle.addMember(projectId, request.body);

    if (!result.ok) {
      const statusCode = result.code === "CONFLICT" ? 409 : 404;
      return reply.status(statusCode).send({ error: result.error });
    }

    return reply.status(201).send({ ok: true, member: result.data });
  });

  /**
   * PATCH /api/webapp/members/:memberId
   * Update a member's details (FR-1.10).
   */
  fastify.patch<{
    Params: { memberId: string };
    Body: { displayName?: string; telegramUsername?: string | null };
  }>("/members/:memberId", async (request, reply) => {
    const { memberId } = request.params;
    const result = await projectLifecycle.updateMember(memberId, request.body);

    if (!result.ok) {
      const statusCode = result.code === "CONFLICT" ? 409 : 404;
      return reply.status(statusCode).send({ error: result.error });
    }

    return reply.send({ ok: true, member: result.data });
  });

  /**
   * DELETE /api/webapp/members/:memberId
   * Remove a member (FR-1.11).
   */
  fastify.delete<{ Params: { memberId: string } }>(
    "/members/:memberId",
    async (request, reply) => {
      const { memberId } = request.params;
      const result = await projectLifecycle.removeMember(memberId);

      if (!result.ok) {
        return reply.status(404).send({ error: result.error });
      }

      return reply.send({ ok: true, id: result.data.id });
    }
  );
}