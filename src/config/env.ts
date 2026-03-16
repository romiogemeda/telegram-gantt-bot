import { z } from "zod";

// ============================================================================
// Environment Configuration
// ============================================================================
// All environment variables are validated at startup. If any are missing or
// invalid, the application will fail fast with a clear error message.
// ============================================================================

const envSchema = z.object({
  // Telegram
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  WEBAPP_URL: z.string().url("WEBAPP_URL must be a valid URL"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Webhook (production only — omitted in development for long polling)
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate environment variables. Call once at startup.
 * Throws a descriptive error if validation fails (fail-fast).
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  _env = result.data;
  return _env;
}

/**
 * Access validated env. Throws if loadEnv() hasn't been called.
 */
export function getEnv(): Env {
  if (!_env) {
    throw new Error("Environment not loaded. Call loadEnv() first.");
  }
  return _env;
}