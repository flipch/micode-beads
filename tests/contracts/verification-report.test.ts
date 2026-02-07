import { describe, expect, it } from "bun:test";

import * as v from "valibot";

import { VerificationItemSchema, VerificationReportSchema } from "../../src/contracts/verification-report";

describe("VerificationItemSchema", () => {
  it("validates a passing completeness item", () => {
    const item = {
      taskId: "1.1",
      category: "completeness",
      status: "pass",
      detail: "All specified files created",
    };
    const result = v.parse(VerificationItemSchema, item);
    expect(result.category).toBe("completeness");
    expect(result.status).toBe("pass");
  });

  it("validates a failing test-coverage item", () => {
    const item = {
      taskId: "2.1",
      category: "test-coverage",
      status: "fail",
      detail: "Missing edge case test for empty input",
    };
    const result = v.parse(VerificationItemSchema, item);
    expect(result.category).toBe("test-coverage");
    expect(result.status).toBe("fail");
  });

  it("validates an item without optional detail", () => {
    const item = {
      taskId: "3.1",
      category: "plan-adherence",
      status: "pass",
    };
    const result = v.parse(VerificationItemSchema, item);
    expect(result.detail).toBeUndefined();
  });

  it("validates a test-pass category item", () => {
    const item = {
      taskId: "1.1",
      category: "test-pass",
      status: "pass",
    };
    const result = v.parse(VerificationItemSchema, item);
    expect(result.category).toBe("test-pass");
  });

  it("rejects an item with invalid category", () => {
    const invalid = {
      taskId: "1.1",
      category: "performance",
      status: "pass",
    };
    expect(() => v.parse(VerificationItemSchema, invalid)).toThrow();
  });

  it("rejects an item with invalid status", () => {
    const invalid = {
      taskId: "1.1",
      category: "completeness",
      status: "warning",
    };
    expect(() => v.parse(VerificationItemSchema, invalid)).toThrow();
  });
});

describe("VerificationReportSchema", () => {
  it("validates a passing verification report", () => {
    const report = {
      version: 1,
      featureId: "auth-refactor",
      planPath: "thoughts/shared/plans/auth-refactor.md",
      overallStatus: "pass",
      items: [
        {
          taskId: "1.1",
          category: "completeness",
          status: "pass",
          detail: "All tasks implemented",
        },
        {
          taskId: "1.1",
          category: "test-coverage",
          status: "pass",
        },
        {
          taskId: "1.1",
          category: "plan-adherence",
          status: "pass",
        },
        {
          taskId: "1.1",
          category: "test-pass",
          status: "pass",
        },
      ],
      completedAt: "2026-02-06T16:00:00.000Z",
    };
    const result = v.parse(VerificationReportSchema, report);
    expect(result.overallStatus).toBe("pass");
    expect(result.items).toHaveLength(4);
  });

  it("validates a failing verification report", () => {
    const report = {
      version: 1,
      featureId: "broken-feature",
      planPath: "thoughts/shared/plans/broken.md",
      overallStatus: "fail",
      items: [
        {
          taskId: "1.1",
          category: "completeness",
          status: "fail",
          detail: "Task 1.3 not implemented",
        },
      ],
      completedAt: "2026-02-06T17:00:00.000Z",
    };
    const result = v.parse(VerificationReportSchema, report);
    expect(result.overallStatus).toBe("fail");
  });

  it("validates a report with empty items array", () => {
    const report = {
      version: 1,
      featureId: "empty-check",
      planPath: "thoughts/shared/plans/empty.md",
      overallStatus: "pass",
      items: [],
      completedAt: "2026-02-06T18:00:00.000Z",
    };
    const result = v.parse(VerificationReportSchema, report);
    expect(result.items).toHaveLength(0);
  });

  it("rejects a report with wrong version", () => {
    const invalid = {
      version: 3,
      featureId: "test",
      planPath: "test.md",
      overallStatus: "pass",
      items: [],
      completedAt: "2026-02-06T10:00:00.000Z",
    };
    expect(() => v.parse(VerificationReportSchema, invalid)).toThrow();
  });

  it("rejects a report with invalid overallStatus", () => {
    const invalid = {
      version: 1,
      featureId: "test",
      planPath: "test.md",
      overallStatus: "partial",
      items: [],
      completedAt: "2026-02-06T10:00:00.000Z",
    };
    expect(() => v.parse(VerificationReportSchema, invalid)).toThrow();
  });

  it("rejects a report missing required planPath", () => {
    const invalid = {
      version: 1,
      featureId: "test",
      overallStatus: "pass",
      items: [],
      completedAt: "2026-02-06T10:00:00.000Z",
    };
    expect(() => v.parse(VerificationReportSchema, invalid)).toThrow();
  });
});
