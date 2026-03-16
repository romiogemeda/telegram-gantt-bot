import { describe, it, expect } from "vitest";
import { VALID_STATUS_TRANSITIONS } from "../../src/shared/types/domain.js";

describe("FF-3: Task Status Transition Rules", () => {
  it("TODO can only transition to IN_PROGRESS", () => {
    expect(VALID_STATUS_TRANSITIONS["TODO"]).toEqual(["IN_PROGRESS"]);
  });

  it("IN_PROGRESS can only transition to DONE", () => {
    expect(VALID_STATUS_TRANSITIONS["IN_PROGRESS"]).toEqual(["DONE"]);
  });

  it("DONE is a terminal state with no forward transitions", () => {
    expect(VALID_STATUS_TRANSITIONS["DONE"]).toEqual([]);
  });

  it("does not allow skipping states (TODO → DONE)", () => {
    expect(VALID_STATUS_TRANSITIONS["TODO"]).not.toContain("DONE");
  });

  it("does not allow reverse transitions (DONE → IN_PROGRESS)", () => {
    expect(VALID_STATUS_TRANSITIONS["DONE"]).not.toContain("IN_PROGRESS");
    expect(VALID_STATUS_TRANSITIONS["DONE"]).not.toContain("TODO");
  });

  it("does not allow reverse transitions (IN_PROGRESS → TODO)", () => {
    expect(VALID_STATUS_TRANSITIONS["IN_PROGRESS"]).not.toContain("TODO");
  });

  it("covers all defined statuses", () => {
    const allStatuses = ["TODO", "IN_PROGRESS", "DONE"];
    for (const status of allStatuses) {
      expect(VALID_STATUS_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(VALID_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });
});