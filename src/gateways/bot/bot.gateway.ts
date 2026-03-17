import { Bot, InlineKeyboard } from "grammy";
import type { FastifyInstance } from "fastify";
import type { ProjectLifecycleService } from "../../modules/project-lifecycle/index.js";
import type { TaskManagementService } from "../../modules/task-management/index.js";
import type { PublishingService } from "../../modules/publishing/index.js";
import { getJsonTemplate } from "../../modules/project-lifecycle/index.js";
import { CREATE_PROJECT_ID } from "./conversations/create-project.conversation.js";
import type { BotContext } from "./types.js";

// ============================================================================
// Bot Gateway
// ============================================================================
// Receives Telegram webhook payloads, parses commands, and dispatches
// to domain module services. Owns NO business logic.
//
// Registers as a Fastify plugin (modular monolith pattern).
// ============================================================================

export interface BotGatewayDeps {
  bot: Bot<BotContext>;
  projectLifecycle: ProjectLifecycleService;
  taskManagement: TaskManagementService;
  publishing: PublishingService;
  webAppUrl: string;
}

export async function botGatewayPlugin(
  fastify: FastifyInstance,
  { bot, projectLifecycle, taskManagement, publishing, webAppUrl }: BotGatewayDeps,
): Promise<void> {
  // ── Commands ──────────────────────────────────────────────────────────

  /**
   * /start — Output usage instructions (FR-1.0).
   */
  bot.command("start", async (ctx: BotContext) => {
    const keyboard = new InlineKeyboard()
      .webApp("📊 Open Dashboard", webAppUrl)
      .text("➕ New Project", "action:newproject")
      .row()
      .text("📋 Get JSON Template", "action:jsontemplate");

    await ctx.reply(
      [
        "🤖 <b>Gantt Bot</b> — Project management inside Telegram.",
        "",
        "Create projects, assign tasks, and track progress with interactive Gantt charts — all without leaving Telegram.",
        "",
        "Tap a button below to get started, or type /help for all commands.",
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  /**
   * /help — Output command reference.
   */
  bot.command("help", async (ctx: BotContext) => {
    const keyboard = new InlineKeyboard()
      .webApp("📊 Open Dashboard", webAppUrl)
      .text("➕ New Project", "action:newproject");

    await ctx.reply(
      [
        "📖 <b>Commands</b>",
        "",
        "/start — Welcome message",
        "/newproject — Create a project step by step (private chat)",
        "/jsontemplate — Get the JSON template for bulk import",
        "/dashboard — Open the visual dashboard",
        "/showgantt — Repost the Gantt chart button (group chats)",
        "/publish — Publish a project to the current group chat",
        "/archive — Archive a project",
        "/settings — Manage project settings",
        "/help — Show this message",
        "",
        "<b>Quick start:</b> Open the Dashboard to create and manage projects visually, or use /newproject for a guided setup.",
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  /**
   * /jsontemplate — Output the JSON schema template (FR-1.3).
   */
  bot.command("jsontemplate", async (ctx: BotContext) => {
    const template = getJsonTemplate();
    await ctx.reply(`Here's the project JSON template:\n\n<pre>${template}</pre>`, {
      parse_mode: "HTML",
    });
  });

  /**
   * /newproject — Initiate guided project creation (FR-1.1).
   *
   * Enters the `create-project` conversation, which uses grammY's
   * conversations plugin to collect data sequentially (FR-1.2).
   */
  bot.command("newproject", async (ctx: BotContext) => {
    if (ctx.chat?.type !== "private") {
      await ctx.reply("Please use /newproject in a private chat with me.");
      return;
    }

    await ctx.conversation.enter(CREATE_PROJECT_ID);
  });

  /**
   * /showgantt — Repost the Gantt chart button in a group (FR-2.4).
   *
   * Looks up the active project published to this group chat,
   * fetches its tasks, and calls publishing.repostSummary().
   */
  bot.command("showgantt", async (ctx: BotContext) => {
    if (ctx.chat?.type === "private" || !ctx.chat) {
      await ctx.reply("Use /showgantt in a group chat where a project is published.");
      return;
    }

    const groupChatId = BigInt(ctx.chat.id);
    const projectResult = await projectLifecycle.getProjectByGroupChatId(groupChatId);

    if (!projectResult.ok) {
      await ctx.reply(
        "No active project found for this group. Ask the project creator to publish one here.",
      );
      return;
    }

    const tasks = await taskManagement.getTasksByProject(projectResult.data.id);
    await publishing.repostSummary(projectResult.data, tasks, groupChatId);
  });

  /**
   * /publish — Associate a project with the current group chat (FR-2.1).
   */
  bot.command("publish", async (ctx: BotContext) => {
    if (ctx.chat?.type === "private" || !ctx.chat) {
      await ctx.reply("Use /publish in a group chat to share a project here.");
      return;
    }

    const creatorId = BigInt(ctx.from!.id);
    const unpublished = await projectLifecycle.getUnpublishedProjectsByCreator(creatorId);

    if (unpublished.length === 0) {
      await ctx.reply(
        "You have no unpublished projects. Create one first with /newproject or from the Dashboard.",
      );
      return;
    }

    // If exactly ONE unpublished project, skip selection
    if (unpublished.length === 1) {
      const project = unpublished[0];
      const projectId = project.id;
      const groupChatId = BigInt(ctx.chat.id);

      // Handle republishing logic (Step 4) - although if it's in 'unpublished' list (groupChatId is null), 
      // this check might be redundant, BUT the user request says to execute steps 3-8, and step 4 is part of that.
      // Wait, getUnpublishedProjectsByCreator returns projects where groupChatId is null.
      // So if it's in 'unpublished', it by definition doesn't have a groupChatId.
      // However, to be safe and follow instructions strictly:
      if (project.groupChatId !== null) {
        if (project.groupChatId === groupChatId) {
          await ctx.reply("This project is already published here. Use /showgantt to repost the chart.");
          return;
        }

        const keyboard = new InlineKeyboard()
          .text("Yes, move it", `confirm_publish:${projectId}`)
          .text("Cancel", "cancel_publish");

        await ctx.reply(
          "⚠️ This project is already published in another group. Publishing here will move it. Continue?",
          { reply_markup: keyboard }
        );
        return;
      }

      const setGroupResult = await projectLifecycle.setGroupChatId(projectId, groupChatId);
      if (!setGroupResult.ok) {
        await ctx.reply(`❌ ${setGroupResult.error}`);
        return;
      }

      const tasks = await taskManagement.getTasksByProject(projectId);
      await publishing.publishToGroup(project, tasks);

      await ctx.reply(
        `✅ <b>"${project.name}"</b> has been published to this group!`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // If MULTIPLE, show selection
    const keyboard = new InlineKeyboard();
    const sorted = unpublished.slice(0, 10);
    for (const p of sorted) {
      keyboard.text(p.name, `publish:${p.id}`).row();
    }

    let text = "Which project would you like to publish to this group?";
    if (unpublished.length > 10) {
      text += "\n\n<i>Showing your 10 most recent projects.</i>";
    }

    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  /**
   * /dashboard — Open the visual dashboard.
   */
  bot.command("dashboard", async (ctx: BotContext) => {
    const keyboard = new InlineKeyboard().webApp("📊 Open Dashboard", webAppUrl);
    await ctx.reply("Tap below to open your project dashboard.", {
      reply_markup: keyboard,
    });
  });

  /**
   * /archive — Archive a project (private chat only).
   */
  bot.command("archive", async (ctx: BotContext) => {
    if (ctx.chat?.type !== "private") {
      await ctx.reply("Use /archive in a private chat with me.");
      return;
    }

    const creatorId = BigInt(ctx.from!.id);
    const projects = await projectLifecycle.getProjectsByCreator(creatorId);

    if (projects.length === 0) {
      await ctx.reply("You have no active projects.");
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const p of projects.slice(0, 10)) {
      keyboard.text(`${p.name} (${p._count.tasks} tasks)`, `archive:${p.id}`).row();
    }

    await ctx.reply(
      "Which project would you like to archive? This will hide it from your dashboard and disable the Gantt chart.",
      { reply_markup: keyboard }
    );
  });

  /**
   * /settings — Manage project settings (private chat only).
   */
  bot.command("settings", async (ctx: BotContext) => {
    if (ctx.chat?.type !== "private") {
      await ctx.reply("Use /settings in a private chat with me.");
      return;
    }

    const creatorId = BigInt(ctx.from!.id);
    const projects = await projectLifecycle.getProjectsByCreator(creatorId);

    if (projects.length === 0) {
      await ctx.reply("You have no active projects.");
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const p of projects.slice(0, 10)) {
      keyboard.text(p.name, `settings:${p.id}`).row();
    }

    await ctx.reply("Which project's settings would you like to manage?", {
      reply_markup: keyboard,
    });
  });

  // ── Callback Query Handlers ───────────────────────────────────────────

  bot.callbackQuery("action:newproject", async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    if (ctx.chat?.type !== "private") {
      await ctx.answerCallbackQuery({ text: "Use this in a private chat with me." });
      return;
    }
    await ctx.conversation.enter(CREATE_PROJECT_ID);
  });

  bot.callbackQuery("action:jsontemplate", async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    const template = getJsonTemplate();
    await ctx.reply(`Here's the project JSON template:\n\n<pre>${template}</pre>`, {
      parse_mode: "HTML",
    });
  });

  bot.callbackQuery(/^publish:(.+)$/, async (ctx: BotContext) => {
    if (!ctx.match) return;
    const projectId = ctx.match[1];
    await ctx.answerCallbackQuery();

    if (!ctx.chat || ctx.chat.type === "private") {
      await ctx.reply("This command only works in group chats.");
      return;
    }

    const groupChatId = BigInt(ctx.chat.id);
    const projectResult = await projectLifecycle.getProject(projectId);

    if (!projectResult.ok) {
      await ctx.reply(`❌ ${projectResult.error}`);
      return;
    }

    const project = projectResult.data;

    // Handle republishing logic (Step 4)
    if (project.groupChatId !== null) {
      if (project.groupChatId === groupChatId) {
        await ctx.reply("This project is already published here. Use /showgantt to repost the chart.");
        return;
      }

      const keyboard = new InlineKeyboard()
        .text("Yes, move it", `confirm_publish:${projectId}`)
        .text("Cancel", "cancel_publish");

      await ctx.editMessageText(
        "⚠️ This project is already published in another group. Publishing here will move it. Continue?",
        { reply_markup: keyboard }
      );
      return;
    }

    // Proceed with publishing
    const setGroupResult = await projectLifecycle.setGroupChatId(projectId, groupChatId);
    if (!setGroupResult.ok) {
      await ctx.reply(`❌ ${setGroupResult.error}`);
      return;
    }

    const tasks = await taskManagement.getTasksByProject(projectId);
    await publishing.publishToGroup(project, tasks);

    await ctx.editMessageText(
      `✅ <b>"${project.name}"</b> has been published to this group!`,
      { parse_mode: "HTML" }
    );
  });

  bot.callbackQuery(/^confirm_publish:(.+)$/, async (ctx: BotContext) => {
    if (!ctx.match) return;
    const projectId = ctx.match[1];
    await ctx.answerCallbackQuery();

    if (!ctx.chat || ctx.chat.type === "private") return;
    const groupChatId = BigInt(ctx.chat.id);

    const projectResult = await projectLifecycle.getProject(projectId);
    if (!projectResult.ok) {
      await ctx.reply(`❌ ${projectResult.error}`);
      return;
    }

    const setGroupResult = await projectLifecycle.setGroupChatId(projectId, groupChatId);
    if (!setGroupResult.ok) {
      await ctx.reply(`❌ ${setGroupResult.error}`);
      return;
    }

    const tasks = await taskManagement.getTasksByProject(projectId);
    await publishing.publishToGroup(projectResult.data, tasks);

    await ctx.editMessageText(
      `✅ <b>"${projectResult.data.name}"</b> has been published to this group!`,
      { parse_mode: "HTML" }
    );
  });

  bot.callbackQuery("cancel_publish", async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Publishing cancelled.");
  });

  // ── Archive handlers ──────────────────────────────────────────────────

  bot.callbackQuery(/^archive:(.+)$/, async (ctx: BotContext) => {
    const projectId = ctx.match![1];
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard()
      .text("Yes, archive it", `confirm_archive:${projectId}`)
      .text("Cancel", "cancel_archive");

    await ctx.editMessageText(
      "⚠️ Are you sure you want to archive this project? This will hide it from your dashboard and disable the Gantt chart in any group it's published to.",
      { reply_markup: keyboard }
    );
  });

  bot.callbackQuery(/^confirm_archive:(.+)$/, async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    const projectId = ctx.match![1];
    const requesterId = BigInt(ctx.from!.id);
    const result = await projectLifecycle.archiveProject(projectId, requesterId);
    if (!result.ok) {
      await ctx.editMessageText(`❌ ${result.error}`);
      return;
    }
    await ctx.editMessageText(`✅ Project archived successfully.`);
  });

  bot.callbackQuery("cancel_archive", async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Archive cancelled. Your project is unchanged.");
  });

  // ── Settings handlers ─────────────────────────────────────────────────

  async function renderSettingsPanel(ctx: BotContext, projectId: string): Promise<void> {
    const projectResult = await projectLifecycle.getProject(projectId);
    if (!projectResult.ok) {
      await ctx.editMessageText(`❌ ${projectResult.error}`);
      return;
    }

    const settings = projectLifecycle.getSettings(projectResult.data);

    const text = [
      `⚙️ <b>Settings: ${projectResult.data.name}</b>`,
      ``,
      `🔔 <b>Notifications:</b> ${settings.notificationsEnabled ? "On ✅" : "Off ❌"}`,
      `<i>When enabled, the bot posts to the group chat when a task status changes.</i>`,
    ].join("\n");

    const keyboard = new InlineKeyboard();
    if (settings.notificationsEnabled) {
      keyboard.text("🔕 Turn Off Notifications", `notif_off:${projectId}`);
    } else {
      keyboard.text("🔔 Turn On Notifications", `notif_on:${projectId}`);
    }
    keyboard.row().text("← Back to projects", "settings_back");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }

  bot.callbackQuery(/^settings:(.+)$/, async (ctx: BotContext) => {
    const projectId = ctx.match![1];
    await ctx.answerCallbackQuery();
    await renderSettingsPanel(ctx, projectId);
  });

  bot.callbackQuery(/^notif_(on|off):(.+)$/, async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    const enable = ctx.match![1] === "on";
    const projectId = ctx.match![2];

    const result = await projectLifecycle.updateSettings(projectId, {
      notificationsEnabled: enable,
    });

    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: `Error: ${result.error}` });
      return;
    }

    await renderSettingsPanel(ctx, projectId);
  });

  bot.callbackQuery("settings_back", async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    const creatorId = BigInt(ctx.from!.id);
    const projects = await projectLifecycle.getProjectsByCreator(creatorId);

    if (projects.length === 0) {
      await ctx.editMessageText("You have no active projects.");
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const p of projects.slice(0, 10)) {
      keyboard.text(p.name, `settings:${p.id}`).row();
    }

    await ctx.editMessageText("Which project's settings would you like to manage?", {
      reply_markup: keyboard,
    });
  });

  // ── Shared: validate JSON and create project ───────────────────────────

  /**
   * Shared logic for creating a project from a parsed JSON object.
   * Used by both the raw text handler and the document upload handler (FR-1.4).
   */
  async function createProjectFromJson(ctx: BotContext, raw: unknown): Promise<void> {
    const validation = projectLifecycle.validateProjectInput(raw);

    if (!validation.ok) {
      await ctx.reply(`❌ <b>Validation failed:</b>\n${validation.error}`, {
        parse_mode: "HTML",
      });
      return;
    }

    const creatorId = BigInt(ctx.from!.id);
    const result = await projectLifecycle.createProject(
      validation.data,
      creatorId,
      (projectId, members, tasks, tx) =>
        taskManagement.createTasks(projectId, members, tasks, tx),
    );

    if (!result.ok) {
      await ctx.reply(`❌ ${result.error}`);
      return;
    }

    const keyboard = new InlineKeyboard()
      .webApp("📊 Open in Dashboard", webAppUrl)
      .row()
      .webApp("📊 Open Project", `${webAppUrl}?projectId=${result.data.id}`);

    await ctx.reply(
      [
        `🎉 <b>Project "${result.data.name}" created!</b>`,
        ``,
        `${result.data.members.length} members added.`,
        ``,
        `Open the project to view your Gantt chart, or add me to a group chat and use /publish to share the Gantt chart.`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: keyboard },
    );

    // Send the preview button (FR-1.7)
    const tasks = await taskManagement.getTasksByProject(result.data.id);
    await publishing.repostSummary(result.data, tasks, BigInt(ctx.chat!.id));
  }

  // ── JSON text message handler (FR-1.4) ────────────────────────────────

  /**
   * Handle raw JSON messages pasted in private chat.
   */
  bot.on("message:text", async (ctx: BotContext) => {
    if (ctx.chat?.type !== "private") return;
    const text = ctx.message?.text;
    if (!text || !text.trim().startsWith("{")) return;

    try {
      const raw = JSON.parse(text);
      await createProjectFromJson(ctx, raw);
    } catch {
      // Not valid JSON — ignore silently
    }
  });

  // ── JSON document upload handler (FR-1.4) ─────────────────────────────

  /**
   * Handle .json file uploads in private chat.
   * Downloads the file via Telegram's getFile API, parses it,
   * and feeds it through the same project creation pipeline.
   */
  bot.on("message:document", async (ctx: BotContext) => {
    if (ctx.chat?.type !== "private") return;

    const doc = ctx.message?.document;
    if (!doc) return;

    // Only accept .json files (by extension or MIME type)
    const fileName = doc.file_name ?? "";
    const mimeType = doc.mime_type ?? "";
    const isJson =
      fileName.endsWith(".json") ||
      mimeType === "application/json" ||
      mimeType === "text/json";

    if (!isJson) return; // Ignore non-JSON documents silently

    // Enforce a reasonable size limit (512 KB)
    if (doc.file_size && doc.file_size > 512 * 1024) {
      await ctx.reply("⚠️ File is too large. Please keep the JSON file under 512 KB.");
      return;
    }

    try {
      // Download file via Telegram Bot API
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

      const response = await fetch(fileUrl);
      if (!response.ok) {
        await ctx.reply("❌ Failed to download the file. Please try again.");
        return;
      }

      const text = await response.text();

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        await ctx.reply("❌ The file doesn't contain valid JSON. Please check the format and try again.");
        return;
      }

      await createProjectFromJson(ctx, raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await ctx.reply(`❌ Error processing file: ${message}`);
    }
  });

  // ── Webhook route ─────────────────────────────────────────────────────

  /**
   * Telegram webhook endpoint. In production, Telegram sends updates here.
   * In development, grammY's long polling is used instead (see app.ts).
   */
  fastify.post("/api/bot/webhook", async (request, reply) => {
    try {
      await bot.handleUpdate(request.body as Parameters<typeof bot.handleUpdate>[0]);
      return reply.status(200).send({ ok: true });
    } catch (err) {
      fastify.log.error(err, "Error handling Telegram update");
      return reply.status(200).send({ ok: true }); // Always 200 to Telegram
    }
  });
}