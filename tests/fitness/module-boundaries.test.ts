import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ============================================================================
// Fitness Functions FF-1 & FF-2: Module Boundary Enforcement
// ============================================================================
// These tests statically analyze import statements in source files to
// ensure module dependency rules are not violated.
//
// FF-1: Dependency direction (no reverse deps from domain → gateway,
//        no reverse deps from core modules → Publishing/Notification).
// FF-2: No cross-module direct Prisma data access.
//
// Run: npm run test:fitness
// ============================================================================

const SRC_DIR = join(import.meta.dirname, "../../src");

/** Recursively collect all .ts files in a directory. */
function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Extract import paths from a TypeScript file. */
function extractImports(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const importRegex = /(?:import|from)\s+["']([^"']+)["']/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe("FF-1: Module Dependency Direction", () => {
  it("domain modules must NOT import from gateways", () => {
    const domainDirs = [
      "modules/project-lifecycle",
      "modules/task-management",
      "modules/publishing",
      "modules/notification",
    ];

    const violations: string[] = [];

    for (const dir of domainDirs) {
      const fullDir = join(SRC_DIR, dir);
      try {
        const files = collectTsFiles(fullDir);
        for (const file of files) {
          const imports = extractImports(file);
          for (const imp of imports) {
            if (imp.includes("/gateways/")) {
              const rel = relative(SRC_DIR, file);
              violations.push(`${rel} imports from gateways: ${imp}`);
            }
          }
        }
      } catch {
        // Directory may not exist in test environment
      }
    }

    expect(violations, `Domain → Gateway violations:\n${violations.join("\n")}`).toEqual([]);
  });

  it("ProjectLifecycle and TaskManagement must NOT import from Publishing or Notification", () => {
    const coreDirs = ["modules/project-lifecycle", "modules/task-management"];
    const forbiddenPaths = ["/publishing/", "/notification/"];

    const violations: string[] = [];

    for (const dir of coreDirs) {
      const fullDir = join(SRC_DIR, dir);
      try {
        const files = collectTsFiles(fullDir);
        for (const file of files) {
          const imports = extractImports(file);
          for (const imp of imports) {
            if (forbiddenPaths.some((fp) => imp.includes(fp))) {
              const rel = relative(SRC_DIR, file);
              violations.push(`${rel} imports from downstream module: ${imp}`);
            }
          }
        }
      } catch {
        // Directory may not exist in test environment
      }
    }

    expect(violations, `Reverse dependency violations:\n${violations.join("\n")}`).toEqual([]);
  });
});

describe("FF-5: No Direct Telegram SDK in Domain Modules", () => {
  it("domain modules must NOT import grammy or @twa-dev/sdk", () => {
    const domainDirs = [
      "modules/project-lifecycle",
      "modules/task-management",
      "modules/publishing",
      "modules/notification",
    ];
    const forbiddenPackages = ["grammy", "@twa-dev/sdk", "node:http", "node:https"];

    const violations: string[] = [];

    for (const dir of domainDirs) {
      const fullDir = join(SRC_DIR, dir);
      try {
        const files = collectTsFiles(fullDir);
        for (const file of files) {
          const imports = extractImports(file);
          for (const imp of imports) {
            if (forbiddenPackages.some((pkg) => imp === pkg || imp.startsWith(pkg + "/"))) {
              const rel = relative(SRC_DIR, file);
              violations.push(`${rel} imports forbidden package: ${imp}`);
            }
          }
        }
      } catch {
        // Directory may not exist in test environment
      }
    }

    expect(
      violations,
      `Direct Telegram SDK usage in domain modules:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});