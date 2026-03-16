// ============================================================================
// Shared Domain Types
// ============================================================================
// Types used across module boundaries. These are the "contracts" between
// modules. Domain modules export service interfaces using these types;
// gateways consume them.
// ============================================================================

/** Project-level settings stored as JSONB. */
export interface ProjectSettings {
  notificationsEnabled: boolean;
}

/** Default settings for new projects. */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  notificationsEnabled: true,
};

/** Valid task status transitions (state machine). */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["DONE"],
  DONE: [], // Terminal state — no forward transitions
};

/** Result type for operations that can fail with a domain reason. */
export type DomainResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: DomainErrorCode };

export type DomainErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INVALID_TRANSITION"
  | "UNAUTHORIZED"
  | "CONFLICT";