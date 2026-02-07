import { describe, expect, it } from "bun:test";

import * as v from "valibot";

import { BatchResultSchema, ExecutionResultSchema, TaskResultSchema } from "../../src/contracts/execution-result";

describe("TaskResultSchema", () => {
  it("validates an approved task result", () => {
    const task = {
      taskId: "1.1",
      beadsId: "bd-a1b2.1",
      status: "approved",
      filePath: "src/auth.ts",
      testFilePath: "tests/auth.test.ts",
      reviewCycles: 1,
      reviewSummary: "Clean implementation, approved on first review",
    };
    const result = v.parse(TaskResultSchema, task);
    expect(result.status).toBe("approved");
    expect(result.reviewCycles).toBe(1);
  });

  it("validates a blocked task result without optional fields", () => {
    const task = {
      taskId: "2.3",
      status: "blocked",
      filePath: "src/api.ts",
      testFilePath: "tests/api.test.ts",
      reviewCycles: 0,
    };
    const result = v.parse(TaskResultSchema, task);
    expect(result.status).toBe("blocked");
    expect(result.beadsId).toBeUndefined();
    expect(result.reviewSummary).toBeUndefined();
  });

  it("validates a changes-requested task result", () => {
    const task = {
      taskId: "1.2",
      status: "changes-requested",
      filePath: "src/handler.ts",
      testFilePath: "tests/handler.test.ts",
      reviewCycles: 2,
      reviewSummary: "Missing error handling",
    };
    const result = v.parse(TaskResultSchema, task);
    expect(result.status).toBe("changes-requested");
  });

  it("rejects a task result with invalid status", () => {
    const invalid = {
      taskId: "1.1",
      status: "unknown",
      filePath: "src/foo.ts",
      testFilePath: "tests/foo.test.ts",
      reviewCycles: 1,
    };
    expect(() => v.parse(TaskResultSchema, invalid)).toThrow();
  });

  it("rejects a task result with missing taskId", () => {
    const invalid = {
      status: "approved",
      filePath: "src/foo.ts",
      testFilePath: "tests/foo.test.ts",
      reviewCycles: 1,
    };
    expect(() => v.parse(TaskResultSchema, invalid)).toThrow();
  });
});

describe("BatchResultSchema", () => {
  it("validates a batch result with summary counts", () => {
    const batch = {
      batchNumber: 1,
      tasks: [
        {
          taskId: "1.1",
          status: "approved",
          filePath: "src/a.ts",
          testFilePath: "tests/a.test.ts",
          reviewCycles: 1,
        },
        {
          taskId: "1.2",
          status: "blocked",
          filePath: "src/b.ts",
          testFilePath: "tests/b.test.ts",
          reviewCycles: 0,
        },
      ],
      totalTasks: 2,
      approved: 1,
      blocked: 1,
    };
    const result = v.parse(BatchResultSchema, batch);
    expect(result.totalTasks).toBe(2);
    expect(result.approved).toBe(1);
    expect(result.blocked).toBe(1);
  });

  it("rejects a batch result missing count fields", () => {
    const invalid = {
      batchNumber: 1,
      tasks: [],
    };
    expect(() => v.parse(BatchResultSchema, invalid)).toThrow();
  });
});

describe("ExecutionResultSchema", () => {
  it("validates a successful execution result", () => {
    const execution = {
      version: 1,
      featureId: "auth-refactor",
      planPath: "thoughts/shared/plans/2026-02-06-auth-refactor.md",
      batches: [
        {
          batchNumber: 1,
          tasks: [
            {
              taskId: "1.1",
              status: "approved",
              filePath: "src/auth.ts",
              testFilePath: "tests/auth.test.ts",
              reviewCycles: 1,
            },
          ],
          totalTasks: 1,
          approved: 1,
          blocked: 0,
        },
      ],
      completedAt: "2026-02-06T12:00:00.000Z",
      overallStatus: "success",
    };
    const result = v.parse(ExecutionResultSchema, execution);
    expect(result.overallStatus).toBe("success");
    expect(result.batches).toHaveLength(1);
  });

  it("validates a partial execution result", () => {
    const execution = {
      version: 1,
      featureId: "data-migration",
      planPath: "thoughts/shared/plans/data-migration.md",
      batches: [],
      completedAt: "2026-02-06T14:00:00.000Z",
      overallStatus: "partial",
    };
    const result = v.parse(ExecutionResultSchema, execution);
    expect(result.overallStatus).toBe("partial");
  });

  it("validates a failed execution result", () => {
    const execution = {
      version: 1,
      featureId: "broken-feature",
      planPath: "thoughts/shared/plans/broken.md",
      batches: [],
      completedAt: "2026-02-06T15:00:00.000Z",
      overallStatus: "failed",
    };
    const result = v.parse(ExecutionResultSchema, execution);
    expect(result.overallStatus).toBe("failed");
  });

  it("rejects an execution result with wrong version", () => {
    const invalid = {
      version: 99,
      featureId: "test",
      planPath: "test.md",
      batches: [],
      completedAt: "2026-02-06T10:00:00.000Z",
      overallStatus: "success",
    };
    expect(() => v.parse(ExecutionResultSchema, invalid)).toThrow();
  });

  it("rejects an execution result with invalid overallStatus", () => {
    const invalid = {
      version: 1,
      featureId: "test",
      planPath: "test.md",
      batches: [],
      completedAt: "2026-02-06T10:00:00.000Z",
      overallStatus: "cancelled",
    };
    expect(() => v.parse(ExecutionResultSchema, invalid)).toThrow();
  });
});
