import type { Conversation } from "@grammyjs/conversations";
import type { BotContext } from "../types.js";
import type { ProjectLifecycleService } from "../../../modules/project-lifecycle/index.js";
import type { TaskManagementService } from "../../../modules/task-management/index.js";
import type { MemberInput, TaskInput } from "../../../modules/project-lifecycle/index.js";
import type { PublishingService } from "../../../modules/publishing/index.js";
import { InlineKeyboard } from "grammy";

// ============================================================================
// Create Project Conversation (FR-1.1, FR-1.2, FR-1.6)
// ============================================================================
// A guided, sequential prompt flow that collects:
//   1. Project name
//   2. Team members (display name + optional Telegram username)
//   3. Tasks (title, assignee, dates, dependencies, optional todos)
//   4. Notification preference
//   5. Summary for review and approval
//
// The user can type /cancel at any point to abort.
//
// This is a grammY "conversation" — a long-running, stateful handler
// that suspends between messages using the conversations plugin.
// ============================================================================

/** Identifier used to register/enter this conversation. */
export const CREATE_PROJECT_ID = "create-project";

/**
 * Factory that returns the conversation function with injected services.
 * We use a factory because conversations are registered at bot setup time,
 * but need access to domain services that are created at composition root.
 */
export function createProjectConversation(
  projectLifecycle: ProjectLifecycleService,
  taskManagement: TaskManagementService,
  publishing: PublishingService,
  webAppUrl: string,
) {
  return async function (
    conversation: Conversation<BotContext, BotContext>,
    ctx: BotContext,
  ): Promise<void> {
    // ── Helper: wait for a text reply (with /cancel detection) ─────────
    async function askText(
      prompt: string,
      validate?: (text: string) => string | null,
    ): Promise<string | null> {
      await ctx.reply(prompt, { parse_mode: "HTML" });

      while (true) {
        const response = await conversation.waitFor("message:text");
        const text = response.message.text.trim();

        if (text === "/cancel") {
          await ctx.reply("❌ Project creation cancelled.");
          return null;
        }

        if (validate) {
          const error = validate(text);
          if (error) {
            await ctx.reply(`⚠️ ${error} Please try again.`);
            continue;
          }
        }

        return text;
      }
    }

    // ── Helper: ask yes/no ─────────────────────────────────────────────
    async function askYesNo(prompt: string): Promise<boolean | null> {
      const answer = await askText(`${prompt}\n\nType <b>yes</b> or <b>no</b>.`);
      if (answer === null) return null;
      return ["yes", "y", "yeah", "yep", "sure"].includes(answer.toLowerCase());
    }

    // ── Helper: validate date format ──────────────────────────────────
    function validateDate(text: string): string | null {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return "Date must be in YYYY-MM-DD format (e.g., 2026-04-01).";
      }
      const d = new Date(text);
      if (isNaN(d.getTime())) {
        return "That's not a valid date.";
      }
      return null;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 1: Project Name
    // ══════════════════════════════════════════════════════════════════════

    await ctx.reply(
      [
        "📋 <b>New Project — Step 1/4</b>",
        "",
        "Let's create your project step by step.",
        "Type /cancel at any point to abort.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );

    const projectName = await askText(
      "What's the <b>project name</b>?",
      (t) => (t.length < 1 ? "Name cannot be empty." : null),
    );
    if (!projectName) return;

    // ══════════════════════════════════════════════════════════════════════
    // Step 2: Team Members
    // ══════════════════════════════════════════════════════════════════════

    await ctx.reply(
      [
        `👥 <b>Step 2/4 — Team Members</b>`,
        "",
        "Now let's add team members. For each member, send their <b>display name</b>.",
        "Optionally include their Telegram username after a comma.",
        "",
        "<i>Examples:</i>",
        "<code>Alice</code>",
        "<code>Bob, @bob_dev</code>",
        "",
        "Type <b>done</b> when you've added everyone.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );

    const members: MemberInput[] = [];

    while (true) {
      const input = await askText(
        `Add member #${members.length + 1} (or type <b>done</b>):`,
      );
      if (input === null) return;

      if (input.toLowerCase() === "done") {
        if (members.length === 0) {
          await ctx.reply("⚠️ You need at least one team member. Please add someone.");
          continue;
        }
        break;
      }

      // Parse "DisplayName" or "DisplayName, @username"
      const parts = input.split(",").map((p) => p.trim());
      const displayName = parts[0];
      const telegramUsername = parts[1]?.replace(/^@/, "") || undefined;

      members.push({ displayName, telegramUsername });
      await ctx.reply(`✅ Added <b>${displayName}</b>${telegramUsername ? ` (@${telegramUsername})` : ""}.`, {
        parse_mode: "HTML",
      });
    }

    const memberNames = members.map((m) => m.displayName);

    // ══════════════════════════════════════════════════════════════════════
    // Step 3: Tasks
    // ══════════════════════════════════════════════════════════════════════

    await ctx.reply(
      [
        `📌 <b>Step 3/4 — Tasks</b>`,
        "",
        `Team: ${memberNames.join(", ")}`,
        "",
        "For each task, I'll ask for:",
        "• Title",
        "• Assignee (from your team)",
        "• Start date & end date",
        "• Dependencies (optional)",
        "• Subtasks/todos (optional)",
        "",
        "Type <b>done</b> when you've added all tasks.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );

    const tasks: TaskInput[] = [];
    const taskTitles: string[] = [];

    while (true) {
      const titleInput = await askText(
        `\n📝 <b>Task #${tasks.length + 1}</b> — Enter the task <b>title</b> (or <b>done</b>):`,
      );
      if (titleInput === null) return;

      if (titleInput.toLowerCase() === "done") {
        if (tasks.length === 0) {
          await ctx.reply("⚠️ You need at least one task. Please add one.");
          continue;
        }
        break;
      }

      const taskTitle = titleInput;

      // ── Assignee ──────────────────────────────────────────────────
      const assigneePrompt =
        memberNames.length === 1
          ? `Assigning to <b>${memberNames[0]}</b>.`
          : `Who should this be assigned to?\n${memberNames.map((n, i) => `  ${i + 1}. ${n}`).join("\n")}\n\nSend the <b>name</b> or <b>number</b>.`;

      let assignee: string;

      if (memberNames.length === 1) {
        assignee = memberNames[0];
        await ctx.reply(assigneePrompt, { parse_mode: "HTML" });
      } else {
        const assigneeInput = await askText(assigneePrompt, (t) => {
          // Accept by number or name
          const num = parseInt(t, 10);
          if (!isNaN(num) && num >= 1 && num <= memberNames.length) return null;
          if (memberNames.some((n) => n.toLowerCase() === t.toLowerCase())) return null;
          return `"${t}" doesn't match any team member.`;
        });
        if (assigneeInput === null) return;

        const num = parseInt(assigneeInput, 10);
        assignee =
          !isNaN(num) && num >= 1 && num <= memberNames.length
            ? memberNames[num - 1]
            : memberNames.find((n) => n.toLowerCase() === assigneeInput.toLowerCase())!;
      }

      // ── Start date ────────────────────────────────────────────────
      const startDate = await askText(
        "📅 <b>Start date</b> (YYYY-MM-DD):",
        validateDate,
      );
      if (startDate === null) return;

      // ── End date ──────────────────────────────────────────────────
      const endDate = await askText(
        "📅 <b>End date</b> (YYYY-MM-DD):",
        (t) => {
          const dateError = validateDate(t);
          if (dateError) return dateError;
          if (t < startDate) return "End date must be on or after the start date.";
          return null;
        },
      );
      if (endDate === null) return;

      // ── Dependencies ──────────────────────────────────────────────
      let dependencies: string[] = [];

      if (taskTitles.length > 0) {
        const depPrompt = [
          `🔗 <b>Dependencies</b> (optional)`,
          `Existing tasks:`,
          ...taskTitles.map((t, i) => `  ${i + 1}. ${t}`),
          "",
          "Send the <b>numbers</b> separated by commas, or <b>skip</b>.",
          "<i>Example: 1, 3</i>",
        ].join("\n");

        const depInput = await askText(depPrompt);
        if (depInput === null) return;

        if (depInput.toLowerCase() !== "skip") {
          const nums = depInput
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n) && n >= 1 && n <= taskTitles.length);
          dependencies = nums.map((n) => taskTitles[n - 1]);
        }
      }

      // ── Todos ─────────────────────────────────────────────────────
      const wantTodos = await askYesNo("📝 Add subtasks/todos for this task?");
      if (wantTodos === null) return;

      const todos: { title: string }[] = [];

      if (wantTodos) {
        await ctx.reply("Send each todo on its own line, or type <b>done</b> when finished.", {
          parse_mode: "HTML",
        });

        while (true) {
          const todoInput = await askText(
            `  Todo #${todos.length + 1} (or <b>done</b>):`,
          );
          if (todoInput === null) return;
          if (todoInput.toLowerCase() === "done") break;
          todos.push({ title: todoInput });
        }
      }

      // ── Save task ─────────────────────────────────────────────────
      tasks.push({
        title: taskTitle,
        assignee,
        startDate,
        endDate,
        dependencies,
        todos,
      });
      taskTitles.push(taskTitle);

      const todoSuffix = todos.length > 0 ? ` (${todos.length} todos)` : "";
      const depSuffix =
        dependencies.length > 0
          ? ` → depends on: ${dependencies.join(", ")}`
          : "";

      await ctx.reply(
        `✅ Task added: <b>${taskTitle}</b> → ${assignee}, ${startDate} to ${endDate}${depSuffix}${todoSuffix}`,
        { parse_mode: "HTML" },
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // Step 4: Settings
    // ══════════════════════════════════════════════════════════════════════

    const notificationsEnabled = await askYesNo(
      [
        "🔔 <b>Step 4/4 — Notifications</b>",
        "",
        "Should the bot send a message to the group chat whenever someone updates a task status?",
      ].join("\n"),
    );
    if (notificationsEnabled === null) return;

    // ══════════════════════════════════════════════════════════════════════
    // Summary (FR-1.6)
    // ══════════════════════════════════════════════════════════════════════

    const summaryLines = [
      "📋 <b>Project Summary — Please Review</b>",
      "",
      `<b>Name:</b> ${projectName}`,
      `<b>Notifications:</b> ${notificationsEnabled ? "On" : "Off"}`,
      "",
      `<b>Team (${members.length}):</b>`,
      ...members.map(
        (m) =>
          `  • ${m.displayName}${m.telegramUsername ? ` (@${m.telegramUsername})` : ""}`,
      ),
      "",
      `<b>Tasks (${tasks.length}):</b>`,
      ...tasks.map((t) => {
        const deps = t.dependencies.length > 0 ? ` [after: ${t.dependencies.join(", ")}]` : "";
        const todosCount = t.todos.length > 0 ? ` (${t.todos.length} todos)` : "";
        return `  • <b>${t.title}</b> → ${t.assignee}, ${t.startDate} to ${t.endDate}${deps}${todosCount}`;
      }),
    ];

    await ctx.reply(summaryLines.join("\n"), { parse_mode: "HTML" });

    const approved = await askYesNo("Does everything look correct? <b>Approve</b> to create the project.");
    if (approved === null) return;

    if (!approved) {
      await ctx.reply(
        [
          "No problem. You can:",
          "• Send /newproject to start over",
          "• Send a corrected JSON payload directly",
        ].join("\n"),
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════
    // Create Project
    // ══════════════════════════════════════════════════════════════════════

    const projectInput = {
      name: projectName,
      members,
      tasks,
      settings: { notificationsEnabled: notificationsEnabled ?? true },
    };

    const validation = projectLifecycle.validateProjectInput(projectInput);
    if (!validation.ok) {
      await ctx.reply(`❌ <b>Validation error:</b>\n${validation.error}`, {
        parse_mode: "HTML",
      });
      return;
    }

    const creatorId = BigInt(ctx.from!.id);
    const result = await projectLifecycle.createProject(
      validation.data,
      creatorId,
      (projectId, createdMembers, taskInputs, tx) =>
        taskManagement.createTasks(projectId, createdMembers, taskInputs, tx),
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
        "",
        `${result.data.members.length} members, ${tasks.length} tasks.`,
        "",
        `Open the project to view your Gantt chart, or add me to a group and use /showgantt to share it.`,
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: keyboard },
    );

    // Send the preview button (FR-1.7)
    const taskWithRelations = await taskManagement.getTasksByProject(result.data.id);
    await publishing.repostSummary(result.data, taskWithRelations, BigInt(ctx.chat!.id));
  };
}