import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "./env.js";

let _prisma: PrismaClient | null = null;

/**
 * Returns a singleton PrismaClient instance.
 * Lazy-initialized on first call.
 */
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const env = getEnv();
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    _prisma = new PrismaClient({
      adapter,
      log:
        env.NODE_ENV === "development"
          ? ["query", "warn", "error"]
          : ["warn", "error"],
    });
  }
  return _prisma;
}

/**
 * Graceful shutdown — disconnect from the database.
 */
export async function disconnectPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}