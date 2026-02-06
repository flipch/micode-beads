import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type CheckResult, checks, type DiagnosticCheck, runAllChecks } from "../../src/cli/doctor-checks";

describe("checks registry", () => {
  let savedChecks: typeof checks extends (infer T)[] ? T[] : never;

  beforeEach(() => {
    savedChecks = [...checks];
  });

  afterEach(() => {
    checks.length = 0;
    checks.push(...savedChecks);
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

  it("should have all 11 diagnostic checks registered", () => {
    const expectedIds = [
      "bun-runtime",
      "opencode-cli",
      "git-available",
      "path-correct",
      "opencode-json-exists",
      "opencode-json-valid",
      "plugin-registered",
      "micode-json-valid",
      "thoughts-dirs",
      "mindmodel-dir",
      "write-permissions",
    ];

    const registeredIds = checks.map((c) => c.id);
    for (const id of expectedIds) {
      expect(registeredIds).toContain(id);
    }
  });
});

describe("runAllChecks", () => {
  let savedChecks: typeof checks extends (infer T)[] ? T[] : never;

  beforeEach(() => {
    savedChecks = [...checks];
  });

  afterEach(() => {
    checks.length = 0;
    checks.push(...savedChecks);
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

function findCheckById(id: string): DiagnosticCheck {
  const check = checks.find((c) => c.id === id);
  if (!check) {
    throw new Error(`Check "${id}" not found in registry`);
  }
  return check;
}

describe("bun-runtime check", () => {
  it("should return PASS since bun is available in this test environment", async () => {
    const check = findCheckById("bun-runtime");
    const result = await check.run("/tmp/test");

    expect(result.id).toBe("bun-runtime");
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("Bun");
    expect(result.fixable).toBe(false);
    expect(result.component).toBe("cli");
  });
});

describe("git-available check", () => {
  it("should return PASS since git is available in this test environment", async () => {
    const check = findCheckById("git-available");
    const result = await check.run("/tmp/test");

    expect(result.id).toBe("git-available");
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("git found at");
    expect(result.fixable).toBe(false);
    expect(result.component).toBe("cli");
  });
});

describe("opencode-json-exists check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should FAIL when opencode.json does not exist", async () => {
    const check = findCheckById("opencode-json-exists");
    const result = await check.run(tempDir);

    expect(result.id).toBe("opencode-json-exists");
    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("not found");
    expect(result.fixable).toBe(true);
    expect(result.component).toBe("config");
  });

  it("should PASS when opencode.json exists", async () => {
    writeFileSync(join(tempDir, "opencode.json"), "{}");
    const check = findCheckById("opencode-json-exists");
    const result = await check.run(tempDir);

    expect(result.id).toBe("opencode-json-exists");
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("exists");
  });
});

describe("opencode-json-valid check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should WARN when opencode.json does not exist", async () => {
    const check = findCheckById("opencode-json-valid");
    const result = await check.run(tempDir);

    expect(result.id).toBe("opencode-json-valid");
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("does not exist");
  });

  it("should FAIL when opencode.json contains invalid JSON", async () => {
    writeFileSync(join(tempDir, "opencode.json"), "{ not valid json }");
    const check = findCheckById("opencode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("invalid JSON");
    expect(result.detail).toBeDefined();
  });

  it("should FAIL when opencode.json is an array instead of object", async () => {
    writeFileSync(join(tempDir, "opencode.json"), "[]");
    const check = findCheckById("opencode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("must be a JSON object");
    expect(result.detail).toContain("array");
  });

  it("should FAIL when opencode.json is a primitive", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '"just a string"');
    const check = findCheckById("opencode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("must be a JSON object");
  });

  it("should PASS when opencode.json is valid JSON object", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": {"micode-beads": {}}}');
    const check = findCheckById("opencode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
    expect(result.message).toContain("valid JSON");
  });

  it("should PASS for empty JSON object", async () => {
    writeFileSync(join(tempDir, "opencode.json"), "{}");
    const check = findCheckById("opencode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
  });
});

describe("plugin-registered check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should FAIL when opencode.json does not exist", async () => {
    const check = findCheckById("plugin-registered");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("does not exist");
    expect(result.fixable).toBe(true);
    expect(result.component).toBe("plugin");
  });

  it("should FAIL when opencode.json contains invalid JSON", async () => {
    writeFileSync(join(tempDir, "opencode.json"), "not json");
    const check = findCheckById("plugin-registered");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("invalid JSON");
  });

  it("should FAIL when opencode.json has no plugin section", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"model": "test"}');
    const check = findCheckById("plugin-registered");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("No plugin section");
  });

  it("should FAIL when plugin section exists but micode-beads is not registered (object format)", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": {"other-plugin": {}}}');
    const check = findCheckById("plugin-registered");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("not registered");
  });

  it("should FAIL when plugin section exists but micode-beads is not registered (array format)", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": ["other-plugin"]}');
    const check = findCheckById("plugin-registered");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("not registered");
  });

  it("should PASS when micode-beads is registered in plugin object", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": {"micode-beads": {}}}');
    const check = findCheckById("plugin-registered");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
    expect(result.message).toContain("registered");
  });

  it("should PASS when micode-beads is registered in plugin array", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": ["micode-beads"]}');
    const check = findCheckById("plugin-registered");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
    expect(result.message).toContain("registered");
  });
});

describe("micode-json-valid check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should PASS when micode-beads.json does not exist (optional)", async () => {
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
    expect(result.message).toContain("not present");
    expect(result.message).toContain("optional");
  });

  it("should FAIL when micode-beads.json contains invalid JSON", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), "{ broken }");
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("invalid JSON");
  });

  it("should FAIL when micode-beads.json is an array", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), "[]");
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("must be a JSON object");
  });

  it("should WARN when agents is not an object", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"agents": "not-an-object"}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"agents" must be an object');
  });

  it("should WARN when features is not an object", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"features": 123}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"features" must be an object');
  });

  it("should WARN when compactionThreshold is out of range", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"compactionThreshold": 5}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"compactionThreshold" must be a number between 0 and 1');
  });

  it("should WARN when compactionThreshold is not a number", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"compactionThreshold": "high"}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"compactionThreshold" must be a number between 0 and 1');
  });

  it("should WARN when methodology is not a string", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"methodology": 42}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"methodology" must be a string');
  });

  it("should WARN when researchDirs is not an array", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"researchDirs": "not-array"}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"researchDirs" must be an array');
  });

  it("should WARN when afk is not a boolean", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"afk": "yes"}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"afk" must be a boolean');
  });

  it("should report multiple schema issues in detail", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"agents": "bad", "afk": "bad"}');
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("WARN");
    expect(result.detail).toContain('"agents" must be an object');
    expect(result.detail).toContain('"afk" must be a boolean');
  });

  it("should PASS for a valid micode-beads.json", async () => {
    writeFileSync(
      join(tempDir, "micode-beads.json"),
      JSON.stringify({
        agents: { commander: { model: "openai/gpt-5.3-codex" } },
        features: { mindmodelInjection: true },
        compactionThreshold: 0.7,
        methodology: "default",
        researchDirs: ["docs/research"],
        afk: false,
      }),
    );
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
    expect(result.message).toContain("valid");
  });

  it("should PASS for empty JSON object (all fields are optional)", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), "{}");
    const check = findCheckById("micode-json-valid");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
  });
});

describe("thoughts-dirs check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should FAIL when no thoughts/ directories exist", async () => {
    const check = findCheckById("thoughts-dirs");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("Missing 4 required");
    expect(result.detail).toContain("thoughts/ledgers");
    expect(result.detail).toContain("thoughts/shared/plans");
    expect(result.detail).toContain("thoughts/shared/designs");
    expect(result.detail).toContain("thoughts/brainstorms");
    expect(result.fixable).toBe(true);
    expect(result.component).toBe("config");
  });

  it("should FAIL with correct count when some directories are missing", async () => {
    mkdirSync(join(tempDir, "thoughts/ledgers"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/brainstorms"), { recursive: true });

    const check = findCheckById("thoughts-dirs");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("Missing 2 required");
    expect(result.detail).toContain("thoughts/shared/plans");
    expect(result.detail).toContain("thoughts/shared/designs");
    expect(result.detail).not.toContain("thoughts/ledgers");
    expect(result.detail).not.toContain("thoughts/brainstorms");
  });

  it("should use singular 'directory' when only one is missing", async () => {
    mkdirSync(join(tempDir, "thoughts/ledgers"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/plans"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/designs"), { recursive: true });

    const check = findCheckById("thoughts-dirs");
    const result = await check.run(tempDir);

    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("Missing 1 required thoughts/ directory");
  });

  it("should PASS when all thoughts/ directories exist", async () => {
    mkdirSync(join(tempDir, "thoughts/ledgers"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/plans"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/designs"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/brainstorms"), { recursive: true });

    const check = findCheckById("thoughts-dirs");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
    expect(result.message).toContain("All required thoughts/ directories exist");
  });
});

describe("mindmodel-dir check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should WARN when .mindmodel/ does not exist", async () => {
    const check = findCheckById("mindmodel-dir");
    const result = await check.run(tempDir);

    expect(result.id).toBe("mindmodel-dir");
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("not found");
    expect(result.message).toContain("optional");
    expect(result.fixable).toBe(false);
    expect(result.component).toBe("config");
  });

  it("should PASS when .mindmodel/ exists", async () => {
    mkdirSync(join(tempDir, ".mindmodel"), { recursive: true });
    const check = findCheckById("mindmodel-dir");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
    expect(result.message).toContain("exists");
  });
});

describe("write-permissions check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should PASS when project directory is writable", async () => {
    const check = findCheckById("write-permissions");
    const result = await check.run(tempDir);

    expect(result.id).toBe("write-permissions");
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("Write access confirmed");
    expect(result.fixable).toBe(false);
    expect(result.component).toBe("cli");
  });

  it("should include thoughts/ in write check when it exists", async () => {
    mkdirSync(join(tempDir, "thoughts"), { recursive: true });
    const check = findCheckById("write-permissions");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
  });

  it("should include .mindmodel/ in write check when it exists", async () => {
    mkdirSync(join(tempDir, ".mindmodel"), { recursive: true });
    const check = findCheckById("write-permissions");
    const result = await check.run(tempDir);

    expect(result.status).toBe("PASS");
  });

  it("should FAIL when project directory is not writable", async () => {
    const readonlyDir = join(tempDir, "readonly");
    mkdirSync(readonlyDir);
    chmodSync(readonlyDir, 0o444);

    const check = findCheckById("write-permissions");

    try {
      const result = await check.run(readonlyDir);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("No write access");
      expect(result.message).toContain("project directory");
    } finally {
      chmodSync(readonlyDir, 0o755);
    }
  });

  it("should FAIL when thoughts/ is not writable", async () => {
    const thoughtsDir = join(tempDir, "thoughts");
    mkdirSync(thoughtsDir);
    chmodSync(thoughtsDir, 0o444);

    const check = findCheckById("write-permissions");

    try {
      const result = await check.run(tempDir);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("thoughts/");
    } finally {
      chmodSync(thoughtsDir, 0o755);
    }
  });
});

describe("path-correct check", () => {
  it("should have fixable set to true", async () => {
    const check = findCheckById("path-correct");
    const result = await check.run("/tmp/test");

    expect(result.fixable).toBe(true);
    expect(result.component).toBe("cli");
  });
});

describe("check result shapes", () => {
  it("all checks should return results with required fields", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "doctor-check-"));

    try {
      for (const check of checks) {
        const result = await check.run(tempDir);

        expect(typeof result.id).toBe("string");
        expect(typeof result.name).toBe("string");
        expect(["PASS", "WARN", "FAIL"]).toContain(result.status);
        expect(typeof result.message).toBe("string");
        expect(typeof result.fixable).toBe("boolean");
        expect(["cli", "plugin", "opencode", "config"]).toContain(result.component);

        expect(result.id).toBe(check.id);
        expect(result.name).toBe(check.name);
        expect(result.component).toBe(check.component);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
