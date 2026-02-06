import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { type CheckResult, checks, type DiagnosticCheck, runAllChecks } from "../../src/cli/doctor-checks";

describe("checks registry", () => {
  let originalLength: number;

  beforeEach(() => {
    originalLength = checks.length;
  });

  afterEach(() => {
    checks.length = originalLength;
  });

  it("should be an array that accepts DiagnosticCheck entries", () => {
    expect(Array.isArray(checks)).toBe(true);

    const testCheck: DiagnosticCheck = {
      id: "test-registry",
      name: "Test Registry",
      component: "cli",
      run: async () => ({
        id: "test-registry",
        name: "Test Registry",
        status: "PASS" as const,
        message: "OK",
        fixable: false,
        component: "cli" as const,
      }),
    };

    checks.push(testCheck);
    expect(checks).toContainEqual(testCheck);
  });
});

describe("runAllChecks", () => {
  let originalLength: number;

  beforeEach(() => {
    originalLength = checks.length;
  });

  afterEach(() => {
    checks.length = originalLength;
  });

  it("should return an empty array when no checks are registered", async () => {
    checks.length = 0;
    const results = await runAllChecks("/tmp/test-project");
    expect(results).toEqual([]);
  });

  it("should execute a single check and return its result", async () => {
    checks.length = 0;

    const expected: CheckResult = {
      id: "single-check",
      name: "Single Check",
      status: "PASS",
      message: "Everything is fine",
      fixable: false,
      component: "cli",
    };

    checks.push({
      id: "single-check",
      name: "Single Check",
      component: "cli",
      run: async () => expected,
    });

    const results = await runAllChecks("/tmp/test-project");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expected);
  });

  it("should execute all registered checks sequentially", async () => {
    checks.length = 0;
    const executionOrder: string[] = [];

    checks.push({
      id: "check-a",
      name: "Check A",
      component: "cli",
      run: async () => {
        executionOrder.push("a");
        return {
          id: "check-a",
          name: "Check A",
          status: "PASS" as const,
          message: "A passed",
          fixable: false,
          component: "cli" as const,
        };
      },
    });

    checks.push({
      id: "check-b",
      name: "Check B",
      component: "config",
      run: async () => {
        executionOrder.push("b");
        return {
          id: "check-b",
          name: "Check B",
          status: "WARN" as const,
          message: "B warned",
          fixable: true,
          component: "config" as const,
        };
      },
    });

    checks.push({
      id: "check-c",
      name: "Check C",
      component: "opencode",
      run: async () => {
        executionOrder.push("c");
        return {
          id: "check-c",
          name: "Check C",
          status: "FAIL" as const,
          message: "C failed",
          fixable: false,
          component: "opencode" as const,
        };
      },
    });

    const results = await runAllChecks("/tmp/test-project");

    expect(results).toHaveLength(3);
    expect(executionOrder).toEqual(["a", "b", "c"]);
    expect(results[0].id).toBe("check-a");
    expect(results[0].status).toBe("PASS");
    expect(results[1].id).toBe("check-b");
    expect(results[1].status).toBe("WARN");
    expect(results[2].id).toBe("check-c");
    expect(results[2].status).toBe("FAIL");
  });

  it("should catch per-check errors and return FAIL result without aborting remaining checks", async () => {
    checks.length = 0;

    checks.push({
      id: "before-error",
      name: "Before Error",
      component: "cli",
      run: async () => ({
        id: "before-error",
        name: "Before Error",
        status: "PASS" as const,
        message: "OK",
        fixable: false,
        component: "cli" as const,
      }),
    });

    checks.push({
      id: "throwing-check",
      name: "Throwing Check",
      component: "config",
      run: async () => {
        throw new Error("Simulated check failure");
      },
    });

    checks.push({
      id: "after-error",
      name: "After Error",
      component: "opencode",
      run: async () => ({
        id: "after-error",
        name: "After Error",
        status: "PASS" as const,
        message: "Still runs",
        fixable: false,
        component: "opencode" as const,
      }),
    });

    const results = await runAllChecks("/tmp/test-project");

    expect(results).toHaveLength(3);
    expect(results[0].status).toBe("PASS");
    expect(results[0].id).toBe("before-error");

    expect(results[1].id).toBe("throwing-check");
    expect(results[1].name).toBe("Throwing Check");
    expect(results[1].status).toBe("FAIL");
    expect(results[1].message).toContain("Simulated check failure");
    expect(results[1].fixable).toBe(false);
    expect(results[1].component).toBe("config");

    expect(results[2].status).toBe("PASS");
    expect(results[2].id).toBe("after-error");
  });

  it("should handle non-Error thrown values gracefully", async () => {
    checks.length = 0;

    checks.push({
      id: "string-throw",
      name: "String Throw",
      component: "plugin",
      run: async () => {
        throw "raw string error";
      },
    });

    const results = await runAllChecks("/tmp/test-project");

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("FAIL");
    expect(results[0].message).toContain("raw string error");
    expect(results[0].detail).toBeUndefined();
  });

  it("should include stack trace in detail for Error instances", async () => {
    checks.length = 0;

    checks.push({
      id: "error-with-stack",
      name: "Error With Stack",
      component: "cli",
      run: async () => {
        throw new Error("has stack");
      },
    });

    const results = await runAllChecks("/tmp/test-project");

    expect(results).toHaveLength(1);
    expect(results[0].detail).toBeDefined();
    expect(results[0].detail).toContain("has stack");
  });

  it("should pass the projectDir argument to each check", async () => {
    checks.length = 0;
    let receivedDir = "";

    checks.push({
      id: "dir-check",
      name: "Dir Check",
      component: "cli",
      run: async (projectDir: string) => {
        receivedDir = projectDir;
        return {
          id: "dir-check",
          name: "Dir Check",
          status: "PASS" as const,
          message: projectDir,
          fixable: false,
          component: "cli" as const,
        };
      },
    });

    await runAllChecks("/my/project/dir");
    expect(receivedDir).toBe("/my/project/dir");
  });

  it("should return results with correct CheckResult shape", async () => {
    checks.length = 0;

    checks.push({
      id: "shape-check",
      name: "Shape Check",
      component: "plugin",
      run: async () => ({
        id: "shape-check",
        name: "Shape Check",
        status: "WARN" as const,
        message: "Something to note",
        detail: "Extra detail here",
        fixable: true,
        component: "plugin" as const,
      }),
    });

    const results = await runAllChecks("/tmp/test");

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.id).toBe("shape-check");
    expect(r.name).toBe("Shape Check");
    expect(r.status).toBe("WARN");
    expect(r.message).toBe("Something to note");
    expect(r.detail).toBe("Extra detail here");
    expect(r.fixable).toBe(true);
    expect(r.component).toBe("plugin");
  });
});
