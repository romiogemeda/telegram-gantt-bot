// ============================================================================
// ESLint Flat Config – Module Boundary Governance
// ============================================================================
// Enforces architectural fitness functions FF-1 and FF-5 at lint time.
// Run: npm run lint:boundaries
// ============================================================================

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Global rules ────────────────────────────────────────────────────
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },

  // ── FF-5: Domain modules must NOT import grammy or Telegram SDKs ──
  {
    files: [
      "src/modules/project-lifecycle/**/*.ts",
      "src/modules/task-management/**/*.ts",
      "src/modules/publishing/**/*.ts",
      "src/modules/notification/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "grammy",
              message:
                "FF-5: Domain modules must use the TelegramAdapter interface, not grammy directly.",
            },
            {
              name: "@twa-dev/sdk",
              message:
                "FF-5: Domain modules must not import Telegram Web App SDK.",
            },
          ],
          patterns: [
            {
              group: ["grammy/*"],
              message: "FF-5: No grammy sub-imports in domain modules.",
            },
            {
              group: ["**/gateways/**"],
              message:
                "FF-1: Domain modules must not import from gateway layer.",
            },
          ],
        },
      ],
    },
  },

  // ── FF-1: Core modules must NOT import from downstream modules ────
  {
    files: [
      "src/modules/project-lifecycle/**/*.ts",
      "src/modules/task-management/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/publishing/**", "**/notification/**"],
              message:
                "FF-1: Core modules must not depend on Publishing or Notification.",
            },
            {
              group: ["**/gateways/**"],
              message:
                "FF-1: Domain modules must not import from gateway layer.",
            },
          ],
        },
      ],
    },
  },

  // ── Ignore patterns ─────────────────────────────────────────────────
  {
    ignores: ["dist/", "node_modules/", "webapp/", "*.config.*"],
  },
);