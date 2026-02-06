import { describe, expect, it } from "bun:test";

import {
  createStageRecord,
  createWorkflowState,
  isValidTransition,
  STAGE_NAMES,
  STAGE_STATUSES,
} from "../../src/workflow/state";

describe("STAGE_NAMES", () => {
  it("should have five stages in order", () => {
    expect(STAGE_NAMES).toEqual(["brainstorm", "plan", "implement", "verify", "commit"]);
  });
});

describe("STAGE_STATUSES", () => {
  it("should have all status values", () => {
    expect(STAGE_STATUSES.PENDING).toBe("pending");
    expect(STAGE_STATUSES.RUNNING).toBe("running");
    expect(STAGE_STATUSES.COMPLETED).toBe("completed");
    expect(STAGE_STATUSES.SKIPPED).toBe("skipped");
    expect(STAGE_STATUSES.FAILED).toBe("failed");
  });
});

describe("isValidTransition", () => {
  it("should allow pending -> running", () => {
    expect(isValidTransition("pending", "running")).toBe(true);
  });

  it("should allow running -> completed", () => {
    expect(isValidTransition("running", "completed")).toBe(true);
  });

  it("should allow running -> failed", () => {
    expect(isValidTransition("running", "failed")).toBe(true);
  });

  it("should allow completed -> running (for re-execution)", () => {
    expect(isValidTransition("completed", "running")).toBe(true);
  });

  it("should allow skipped -> running", () => {
    expect(isValidTransition("skipped", "running")).toBe(true);
  });

  it("should allow failed -> running (for retry)", () => {
    expect(isValidTransition("failed", "running")).toBe(true);
  });

  it("should not allow pending -> completed", () => {
    expect(isValidTransition("pending", "completed")).toBe(false);
  });

  it("should not allow pending -> failed", () => {
    expect(isValidTransition("pending", "failed")).toBe(false);
  });

  it("should not allow completed -> failed", () => {
    expect(isValidTransition("completed", "failed")).toBe(false);
  });

  it("should not allow completed -> pending", () => {
    expect(isValidTransition("completed", "pending")).toBe(false);
  });
});

describe("createStageRecord", () => {
  it("should create a record with pending status and version 0", () => {
    const record = createStageRecord();

    expect(record.status).toBe("pending");
    expect(record.version).toBe(0);
    expect(record.artifactPaths).toEqual([]);
    expect(record.startedAt).toBeUndefined();
    expect(record.completedAt).toBeUndefined();
    expect(record.inputHash).toBeUndefined();
  });
});

describe("createWorkflowState", () => {
  it("should create state with correct feature ID and AFK mode", () => {
    const state = createWorkflowState("test-feature", true);

    expect(state.featureId).toBe("test-feature");
    expect(state.afkMode).toBe(true);
    expect(state.currentStage).toBe("brainstorm");
    expect(state.stages).toEqual({});
    expect(state.corrections).toEqual([]);
  });

  it("should set timestamps to ISO strings", () => {
    const before = new Date().toISOString();
    const state = createWorkflowState("my-feature", false);
    const after = new Date().toISOString();

    expect(state.createdAt >= before).toBe(true);
    expect(state.createdAt <= after).toBe(true);
    expect(state.updatedAt).toBe(state.createdAt);
  });

  it("should default currentStage to the first stage name", () => {
    const state = createWorkflowState("feature-x", false);

    expect(state.currentStage).toBe(STAGE_NAMES[0]);
  });
});
