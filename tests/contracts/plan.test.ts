import { describe, expect, it } from "bun:test";

import * as v from "valibot";

import { BatchSchema, MicroTaskSchema, PlanContractSchema } from "../../src/contracts/plan";

describe("MicroTaskSchema", () => {
  it("validates a complete micro-task", () => {
    const task = {
      id: "1.1",
      beadsId: "bd-a1b2.1",
      title: "Implement auth middleware",
      filePath: "src/middleware/auth.ts",
      testFilePath: "tests/middleware/auth.test.ts",
      description: "Create JWT validation middleware",
      dependencies: ["1.0"],
      codeSnippets: [
        {
          path: "src/middleware/auth.ts",
          language: "typescript",
          code: "export function validateJwt() {}",
        },
      ],
    };
    const result = v.parse(MicroTaskSchema, task);
    expect(result.id).toBe("1.1");
    expect(result.beadsId).toBe("bd-a1b2.1");
    expect(result.codeSnippets).toHaveLength(1);
  });

  it("validates a minimal micro-task without optional fields", () => {
    const task = {
      id: "2.1",
      title: "Add error handler",
      filePath: "src/errors.ts",
      testFilePath: "tests/errors.test.ts",
      description: "Global error handler",
      dependencies: [],
    };
    const result = v.parse(MicroTaskSchema, task);
    expect(result.id).toBe("2.1");
    expect(result.beadsId).toBeUndefined();
    expect(result.codeSnippets).toBeUndefined();
  });

  it("rejects a micro-task missing required fields", () => {
    const invalid = {
      id: "1.1",
      title: "Missing fields",
    };
    expect(() => v.parse(MicroTaskSchema, invalid)).toThrow();
  });

  it("rejects a micro-task with wrong dependency type", () => {
    const invalid = {
      id: "1.1",
      title: "Bad deps",
      filePath: "src/foo.ts",
      testFilePath: "tests/foo.test.ts",
      description: "Bad deps type",
      dependencies: [123],
    };
    expect(() => v.parse(MicroTaskSchema, invalid)).toThrow();
  });
});

describe("BatchSchema", () => {
  it("validates a batch with tasks", () => {
    const batch = {
      batchNumber: 1,
      description: "Core implementation",
      tasks: [
        {
          id: "1.1",
          title: "Task A",
          filePath: "src/a.ts",
          testFilePath: "tests/a.test.ts",
          description: "First task",
          dependencies: [],
        },
        {
          id: "1.2",
          title: "Task B",
          filePath: "src/b.ts",
          testFilePath: "tests/b.test.ts",
          description: "Second task",
          dependencies: ["1.1"],
        },
      ],
    };
    const result = v.parse(BatchSchema, batch);
    expect(result.batchNumber).toBe(1);
    expect(result.tasks).toHaveLength(2);
  });

  it("rejects a batch with non-numeric batchNumber", () => {
    const invalid = {
      batchNumber: "one",
      description: "Bad batch",
      tasks: [],
    };
    expect(() => v.parse(BatchSchema, invalid)).toThrow();
  });
});

describe("PlanContractSchema", () => {
  it("validates a complete plan contract", () => {
    const plan = {
      version: 1,
      featureId: "auth-refactor",
      title: "Auth System Refactor",
      overview: "Modernize the auth system",
      approach: "Incremental migration",
      batches: [
        {
          batchNumber: 1,
          description: "Foundation",
          tasks: [
            {
              id: "1.1",
              title: "Create types",
              filePath: "src/auth/types.ts",
              testFilePath: "tests/auth/types.test.ts",
              description: "Define auth types",
              dependencies: [],
            },
          ],
        },
      ],
      createdAt: "2026-02-06T10:00:00.000Z",
      beadsEpicId: "bd-epic-x1y2",
    };
    const result = v.parse(PlanContractSchema, plan);
    expect(result.version).toBe(1);
    expect(result.featureId).toBe("auth-refactor");
    expect(result.batches).toHaveLength(1);
    expect(result.beadsEpicId).toBe("bd-epic-x1y2");
  });

  it("validates a plan without optional beadsEpicId", () => {
    const plan = {
      version: 1,
      featureId: "simple-fix",
      title: "Simple Fix",
      overview: "Fix a bug",
      approach: "Direct patch",
      batches: [],
      createdAt: "2026-02-06T10:00:00.000Z",
    };
    const result = v.parse(PlanContractSchema, plan);
    expect(result.beadsEpicId).toBeUndefined();
  });

  it("rejects a plan with wrong version", () => {
    const invalid = {
      version: 2,
      featureId: "test",
      title: "Test",
      overview: "Test",
      approach: "Test",
      batches: [],
      createdAt: "2026-02-06T10:00:00.000Z",
    };
    expect(() => v.parse(PlanContractSchema, invalid)).toThrow();
  });

  it("rejects a plan missing featureId", () => {
    const invalid = {
      version: 1,
      title: "Test",
      overview: "Test",
      approach: "Test",
      batches: [],
      createdAt: "2026-02-06T10:00:00.000Z",
    };
    expect(() => v.parse(PlanContractSchema, invalid)).toThrow();
  });
});
