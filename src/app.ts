import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { resolve } from "node:path";

import { loadEnv, getPrisma, disconnectPrisma } from "./config/index.js";

// Domain modules
import { ProjectLifecycleService } from "./modules/project-lifecycle/index.js";
import { TaskManagementService } from "./modules/task-management/index.js";
import { PublishingService } from "./modules/publishing/index.js";
import { NotificationService } from "./modules/notification/index.js";

// Gateways
import { botGatewayPlugin } from "./gateways/bot/bot.gateway.js";
import { webAppGatewayPlugin } from "./gateways/webapp/webapp.gateway.js";
import { GrammyTelegramAdapter } from "./gateways/shared/grammy-telegram.adapter.js";
import type { BotContext } from "./gateways/bot/types.js";
import {
  CREATE_PROJECT_ID,
  createProjectConversation,
} from "./gateways/bot/conversations/create-project.conversation.js";

// ============================================================================
// Application Bootstrap
// ============================================================================
// Single entry point that:
//   1. Validates environment
//   2. Instantiates all services (dependency injection via constructor)
//   3. Registers Fastify plugins (gateways)
//   4. Starts the server
//
// This is the "composition root" — the only place that knows about
// concrete implementations. Domain modules depend only on interfaces.
// ============================================================================

async function main(): Promise<void> {
  // ── 1. Environment ──────────────────────────────────────────────────
  const env = loadEnv();

  // ── 2. Infrastructure ───────────────────────────────────────────────
  const prisma = getPrisma();
  const bot = new Bot<BotContext>(env.BOT_TOKEN);
  const telegramAdapter = new GrammyTelegramAdapter(bot);

  // ── 3. Domain Services (Dependency Injection) ───────────────────────
  const projectLifecycle = new ProjectLifecycleService(prisma);
  const taskManagement = new TaskManagementService(prisma);
  const publishing = new PublishingService(telegramAdapter, env.WEBAPP_URL);
  const notification = new NotificationService(telegramAdapter);

  // ── 3b. Bot Middleware (session + conversations) ────────────────────
  // Must be attached before gateway command registration.
  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());

  // Register the guided project creation conversation (FR-1.2)
  const projectConversationFn = createProjectConversation(projectLifecycle, taskManagement, publishing);
  bot.use(createConversation(projectConversationFn, CREATE_PROJECT_ID));

  // ── 4. Fastify Server ───────────────────────────────────────────────
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // ── 4b. Fastify Hooks & Error Handling ──────────────────────────────
  // Fastify's default JSON serializer (and JSON.stringify) doesn't support
  // BigInt. Setting toJSON on the prototype is the most standard fix.
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  // Global error handler to capture serialization or logic errors
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({ err: error, url: request.url }, "Unhandled server error");
    return reply.status(500).send({
      error: "Internal Server Error",
      message: env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  });

  // CORS for Mini App dev (in production, same-origin via static serving)
  await fastify.register(fastifyCors, {
    origin: env.NODE_ENV === "development" ? true : env.WEBAPP_URL,
  });

  // ── 5. Register Gateways as Fastify Plugins ─────────────────────────

  // Bot Gateway: /api/bot/*
  await fastify.register(botGatewayPlugin, {
    prefix: "/api/bot",
    bot,
    projectLifecycle,
    taskManagement,
    publishing,
  });

  // WebApp Gateway: /api/webapp/*
  await fastify.register(webAppGatewayPlugin, {
    prefix: "/api/webapp",
    botToken: env.BOT_TOKEN,
    projectLifecycle,
    taskManagement,
    notification,
  });

  // ── 6. Static Files (Mini App in Production) ────────────────────────
  if (env.NODE_ENV === "production") {
    await fastify.register(fastifyStatic, {
      root: resolve(import.meta.dirname, "../../webapp/dist"),
      prefix: "/",
      wildcard: true, // SPA fallback
    });
  }

  // ── 7. Health Check ─────────────────────────────────────────────────
  fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // ── 8. Start ────────────────────────────────────────────────────────
  try {
    // Webhook vs Long Polling
    if (env.NODE_ENV === "production" && env.WEBHOOK_URL) {
      await bot.api.setWebhook(`${env.WEBHOOK_URL}/api/bot/webhook`, {
        secret_token: env.WEBHOOK_SECRET,
      });
      fastify.log.info(`Webhook set to ${env.WEBHOOK_URL}/api/bot/webhook`);
    } else {
      // Development: use long polling (non-blocking)
      bot.start({
        onStart: () => fastify.log.info("Bot started (long polling)"),
      });
    }

    await fastify.listen({ port: env.PORT, host: env.HOST });
    fastify.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // ── 9. Graceful Shutdown ────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down…`);
    await bot.stop();
    await fastify.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();