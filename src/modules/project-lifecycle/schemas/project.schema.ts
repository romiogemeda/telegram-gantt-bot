import { z } from "zod";

// ============================================================================
// JSON Validation Schemas (FR-1.5)
// ============================================================================
// These schemas validate the JSON payload for one-step project creation
// (FR-1.4) and the guided prompt output. They are also used to generate
// the JSON template output (FR-1.3).
// ============================================================================

export const memberInputSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  telegramUsername: z.string().optional(),
});

export const todoInputSchema = z.object({
  title: z.string().min(1, "Todo title is required"),
});

export const taskInputSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  assignee: z.string().min(1, "Assignee display name is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
  dependencies: z.array(z.string()).default([]),
  todos: z.array(todoInputSchema).default([]),
});

export const projectInputSchema = z
  .object({
    name: z.string().min(1, "Project name is required"),
    members: z.array(memberInputSchema).min(1, "At least one member is required"),
    tasks: z.array(taskInputSchema).min(1, "At least one task is required"),
    settings: z
      .object({
        notificationsEnabled: z.boolean().default(true),
      })
      .default({ notificationsEnabled: true }),
  })
  .refine(
    (data) => {
      // Every task assignee must match a member displayName
      const memberNames = new Set(data.members.map((m) => m.displayName));
      return data.tasks.every((t) => memberNames.has(t.assignee));
    },
    { message: "Every task assignee must match a member's displayName" },
  )
  .refine(
    (data) => {
      // Every dependency must reference an existing task title
      const taskTitles = new Set(data.tasks.map((t) => t.title));
      return data.tasks.every((t) =>
        t.dependencies.every((dep) => taskTitles.has(dep)),
      );
    },
    { message: "Every task dependency must reference an existing task title" },
  );

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type MemberInput = z.infer<typeof memberInputSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;

/**
 * Returns a blank JSON template string for FR-1.3 (/jsontemplate command).
 */
export function getJsonTemplate(): string {
  const template = {
    name: "My Project",
    members: [
      { displayName: "Alice", telegramUsername: "@alice" },
      { displayName: "Bob" },
    ],
    tasks: [
      {
        title: "Design Database",
        assignee: "Alice",
        startDate: "2026-04-01",
        endDate: "2026-04-07",
        dependencies: [],
        todos: [{ title: "Create ERD" }, { title: "Review with team" }],
      },
      {
        title: "Implement API",
        assignee: "Bob",
        startDate: "2026-04-08",
        endDate: "2026-04-14",
        dependencies: ["Design Database"],
        todos: [],
      },
    ],
    settings: {
      notificationsEnabled: true,
    },
  };
  return JSON.stringify(template, null, 2);
}