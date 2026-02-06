import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckResult } from "../../src/cli/doctor-checks";
import { type DiagnosticFix, fixes, runFixes } from "../../src/cli/doctor-fixes";

function makeFailedCheck(overrides: Partial<CheckResult> & { id: string }): CheckResult {
  return {
    name: overrides.name || overrides.id,
    status: "FAIL",
    message: overrides.message || "check failed",
    fixable: overrides.fixable !== undefined ? overrides.fixable : true,
    component: overrides.component || "config",
    ...overrides,
  };
}

describe("fixes registry", () => {
  it("should be an array with all 6 fixable check fixes", () => {
    expect(Array.isArray(fixes)).toBe(true);

    const expectedIds = [
      "path-correct",
      "opencode-json-exists",
      "opencode-json-valid",
      "plugin-registered",
      "micode-json-valid",
      "thoughts-dirs",
    ];

    const registeredIds = fixes.map((f) => f.checkId);
    for (const id of expectedIds) {
      expect(registeredIds).toContain(id);
    }
  });

  it("should have correct isDestructive flags", () => {
    const destructiveIds = fixes.filter((f) => f.isDestructive).map((f) => f.checkId);
    expect(destructiveIds).toEqual(["opencode-json-valid"]);

    const nonDestructiveIds = fixes.filter((f) => !f.isDestructive).map((f) => f.checkId);
    expect(nonDestructiveIds).toContain("path-correct");
    expect(nonDestructiveIds).toContain("opencode-json-exists");
    expect(nonDestructiveIds).toContain("plugin-registered");
    expect(nonDestructiveIds).toContain("micode-json-valid");
    expect(nonDestructiveIds).toContain("thoughts-dirs");
  });
});

describe("runFixes", () => {
  let savedFixes: DiagnosticFix[];

  beforeEach(() => {
    savedFixes = [...fixes];
  });

  afterEach(() => {
    fixes.length = 0;
    fixes.push(...savedFixes);
  });

  it("should return empty array when no checks are fixable", async () => {
    const nonFixable = makeFailedCheck({ id: "write-permissions", fixable: false });
    const results = await runFixes([nonFixable], "/tmp/test", true);
    expect(results).toEqual([]);
  });

  it("should skip checks with no matching fix", async () => {
    fixes.length = 0;
    const check = makeFailedCheck({ id: "no-matching-fix", fixable: true });
    const results = await runFixes([check], "/tmp/test", true);
    expect(results).toEqual([]);
  });

  it("should skip destructive fixes in non-interactive mode", async () => {
    fixes.length = 0;
    fixes.push({
      checkId: "destructive-check",
      isDestructive: true,
      run: async () => ({ checkId: "destructive-check", status: "FIXED", message: "fixed" }),
    });

    const check = makeFailedCheck({ id: "destructive-check", name: "Destructive Check" });
    const results = await runFixes([check], "/tmp/test", false);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("MANUAL");
    expect(results[0].message).toContain("non-interactive mode");
  });

  it("should run destructive fixes in interactive mode", async () => {
    fixes.length = 0;
    fixes.push({
      checkId: "destructive-check",
      isDestructive: true,
      run: async () => ({ checkId: "destructive-check", status: "FIXED", message: "fixed it" }),
    });

    const check = makeFailedCheck({ id: "destructive-check" });
    const results = await runFixes([check], "/tmp/test", true);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("FIXED");
  });

  it("should catch errors in fix execution and return MANUAL result", async () => {
    fixes.length = 0;
    fixes.push({
      checkId: "throwing-fix",
      isDestructive: false,
      run: async () => {
        throw new Error("fix exploded");
      },
    });

    const check = makeFailedCheck({ id: "throwing-fix" });
    const results = await runFixes([check], "/tmp/test", true);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("MANUAL");
    expect(results[0].message).toContain("fix exploded");
  });

  it("should process multiple fixes in order", async () => {
    fixes.length = 0;
    const order: string[] = [];

    fixes.push({
      checkId: "fix-a",
      isDestructive: false,
      run: async () => {
        order.push("a");
        return { checkId: "fix-a", status: "FIXED" as const, message: "a fixed" };
      },
    });

    fixes.push({
      checkId: "fix-b",
      isDestructive: false,
      run: async () => {
        order.push("b");
        return { checkId: "fix-b", status: "FIXED" as const, message: "b fixed" };
      },
    });

    const checks = [makeFailedCheck({ id: "fix-a" }), makeFailedCheck({ id: "fix-b" })];
    const results = await runFixes(checks, "/tmp/test", true);

    expect(results).toHaveLength(2);
    expect(order).toEqual(["a", "b"]);
  });
});

describe("path-correct fix", () => {
  it("should return MANUAL status with PATH guidance", async () => {
    const fix = fixes.find((f) => f.checkId === "path-correct")!;
    const result = await fix.run("/tmp/test", true);

    expect(result.checkId).toBe("path-correct");
    expect(result.status).toBe("MANUAL");
    expect(result.message).toContain("PATH");
    expect(result.action).toBeDefined();
    expect(result.action).toContain("~/.local/bin");
    expect(result.action).toContain("~/.bun/bin");
  });

  it("should return MANUAL status in non-interactive mode", async () => {
    const fix = fixes.find((f) => f.checkId === "path-correct")!;
    const result = await fix.run("/tmp/test", false);

    expect(result.status).toBe("MANUAL");
  });
});

describe("opencode-json-exists fix", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-fix-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create opencode.json when it does not exist", async () => {
    const fix = fixes.find((f) => f.checkId === "opencode-json-exists")!;
    const result = await fix.run(tempDir, false);

    expect(result.checkId).toBe("opencode-json-exists");
    expect(result.status).toBe("FIXED");
    expect(result.message).toContain("Created opencode.json");

    const configPath = join(tempDir, "opencode.json");
    expect(existsSync(configPath)).toBe(true);

    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content.plugin).toBeDefined();
    expect(content.plugin["micode-beads"]).toBeDefined();
  });

  it("should return SKIPPED when opencode.json already exists", async () => {
    writeFileSync(join(tempDir, "opencode.json"), "{}");

    const fix = fixes.find((f) => f.checkId === "opencode-json-exists")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("already exists");
  });

  it("should be idempotent: second run returns SKIPPED", async () => {
    const fix = fixes.find((f) => f.checkId === "opencode-json-exists")!;

    const first = await fix.run(tempDir, false);
    expect(first.status).toBe("FIXED");

    const second = await fix.run(tempDir, false);
    expect(second.status).toBe("SKIPPED");
  });
});

describe("opencode-json-valid fix", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-fix-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should be marked as destructive", () => {
    const fix = fixes.find((f) => f.checkId === "opencode-json-valid")!;
    expect(fix.isDestructive).toBe(true);
  });

  it("should return SKIPPED when opencode.json does not exist", async () => {
    const fix = fixes.find((f) => f.checkId === "opencode-json-valid")!;
    const result = await fix.run(tempDir, true);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("does not exist");
  });

  it("should return SKIPPED when opencode.json is already valid", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": {"micode-beads": {}}}');

    const fix = fixes.find((f) => f.checkId === "opencode-json-valid")!;
    const result = await fix.run(tempDir, true);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("already valid");
  });

  it("should replace malformed JSON and create backup", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, "{ not valid json }");

    const fix = fixes.find((f) => f.checkId === "opencode-json-valid")!;
    const result = await fix.run(tempDir, true);

    expect(result.status).toBe("FIXED");
    expect(result.message).toContain("Replaced malformed");
    expect(result.action).toContain(".backup");

    const newContent = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(newContent.plugin).toBeDefined();
    expect(newContent.plugin["micode-beads"]).toBeDefined();

    const backupPath = `${configPath}.backup`;
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, "utf-8")).toBe("{ not valid json }");
  });

  it("should replace when JSON is an array instead of object", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, "[]");

    const fix = fixes.find((f) => f.checkId === "opencode-json-valid")!;
    const result = await fix.run(tempDir, true);

    expect(result.status).toBe("FIXED");

    const newContent = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(typeof newContent).toBe("object");
    expect(Array.isArray(newContent)).toBe(false);
  });

  it("should be idempotent: second run returns SKIPPED", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, "not json");

    const fix = fixes.find((f) => f.checkId === "opencode-json-valid")!;

    const first = await fix.run(tempDir, true);
    expect(first.status).toBe("FIXED");

    const second = await fix.run(tempDir, true);
    expect(second.status).toBe("SKIPPED");
  });
});

describe("plugin-registered fix", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-fix-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return MANUAL when opencode.json does not exist", async () => {
    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.message).toContain("does not exist");
  });

  it("should return MANUAL when opencode.json contains invalid JSON", async () => {
    writeFileSync(join(tempDir, "opencode.json"), "broken json");

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.message).toContain("invalid JSON");
  });

  it("should add plugin section when none exists", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, '{"model": "test"}');

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("FIXED");
    expect(result.message).toContain("Added micode-beads");

    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content.plugin["micode-beads"]).toBeDefined();
    expect(content.model).toBe("test");
  });

  it("should add micode-beads to existing plugin object", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, '{"plugin": {"other-plugin": {}}}');

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("FIXED");

    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content.plugin["micode-beads"]).toBeDefined();
    expect(content.plugin["other-plugin"]).toBeDefined();
  });

  it("should add micode-beads to existing plugin array", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, '{"plugin": ["other-plugin"]}');

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("FIXED");

    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content.plugin).toContain("micode-beads");
    expect(content.plugin).toContain("other-plugin");
  });

  it("should replace non-object/non-array plugin section", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, '{"plugin": "bad-value"}');

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("FIXED");

    const content = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(content.plugin["micode-beads"]).toBeDefined();
  });

  it("should return SKIPPED when micode-beads is already registered (object format)", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": {"micode-beads": {}}}');

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("already registered");
  });

  it("should return SKIPPED when micode-beads is already registered (array format)", async () => {
    writeFileSync(join(tempDir, "opencode.json"), '{"plugin": ["micode-beads"]}');

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("already registered");
  });

  it("should be idempotent: second run returns SKIPPED", async () => {
    const configPath = join(tempDir, "opencode.json");
    writeFileSync(configPath, '{"model": "test"}');

    const fix = fixes.find((f) => f.checkId === "plugin-registered")!;

    const first = await fix.run(tempDir, false);
    expect(first.status).toBe("FIXED");

    const second = await fix.run(tempDir, false);
    expect(second.status).toBe("SKIPPED");
  });
});

describe("micode-json-valid fix", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-fix-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return SKIPPED when micode-beads.json does not exist", async () => {
    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("does not exist");
  });

  it("should return MANUAL when micode-beads.json contains invalid JSON", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), "broken");

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.message).toContain("invalid JSON");
    expect(result.action).toContain("Fix the JSON syntax");
  });

  it("should return MANUAL when micode-beads.json is not an object", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), "[]");

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.message).toContain("must be a JSON object");
  });

  it("should return SKIPPED when micode-beads.json has no schema issues", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"agents": {}, "afk": false}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("no schema issues");
  });

  it("should return MANUAL with specific field issues for agents", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"agents": "bad"}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.message).toContain("1 schema issue");
    expect(result.action).toContain('"agents"');
  });

  it("should return MANUAL with specific field issues for features", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"features": 123}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.action).toContain('"features"');
  });

  it("should return MANUAL with specific field issues for compactionThreshold", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"compactionThreshold": 5}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.action).toContain('"compactionThreshold"');
  });

  it("should return MANUAL with specific field issues for methodology", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"methodology": 42}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.action).toContain('"methodology"');
  });

  it("should return MANUAL with specific field issues for researchDirs", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"researchDirs": "bad"}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.action).toContain('"researchDirs"');
  });

  it("should return MANUAL with specific field issues for afk", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"afk": "yes"}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.action).toContain('"afk"');
  });

  it("should return MANUAL with specific field issues for fragments", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"fragments": "bad"}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.action).toContain('"fragments"');
  });

  it("should report multiple schema issues", async () => {
    writeFileSync(join(tempDir, "micode-beads.json"), '{"agents": "bad", "afk": "bad"}');

    const fix = fixes.find((f) => f.checkId === "micode-json-valid")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("MANUAL");
    expect(result.message).toContain("2 schema issues");
    expect(result.action).toContain('"agents"');
    expect(result.action).toContain('"afk"');
  });
});

describe("thoughts-dirs fix", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-fix-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create all missing thoughts/ directories", async () => {
    const fix = fixes.find((f) => f.checkId === "thoughts-dirs")!;
    const result = await fix.run(tempDir, false);

    expect(result.checkId).toBe("thoughts-dirs");
    expect(result.status).toBe("FIXED");
    expect(result.message).toContain("Created 4 missing");
    expect(result.action).toContain("thoughts/ledgers");
    expect(result.action).toContain("thoughts/shared/plans");
    expect(result.action).toContain("thoughts/shared/designs");
    expect(result.action).toContain("thoughts/brainstorms");

    expect(existsSync(join(tempDir, "thoughts/ledgers"))).toBe(true);
    expect(existsSync(join(tempDir, "thoughts/shared/plans"))).toBe(true);
    expect(existsSync(join(tempDir, "thoughts/shared/designs"))).toBe(true);
    expect(existsSync(join(tempDir, "thoughts/brainstorms"))).toBe(true);
  });

  it("should create only missing directories when some exist", async () => {
    mkdirSync(join(tempDir, "thoughts/ledgers"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/brainstorms"), { recursive: true });

    const fix = fixes.find((f) => f.checkId === "thoughts-dirs")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("FIXED");
    expect(result.message).toContain("Created 2 missing");
    expect(result.action).toContain("thoughts/shared/plans");
    expect(result.action).toContain("thoughts/shared/designs");
    expect(result.action).not.toContain("thoughts/ledgers");
    expect(result.action).not.toContain("thoughts/brainstorms");
  });

  it("should use singular 'directory' when only one is missing", async () => {
    mkdirSync(join(tempDir, "thoughts/ledgers"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/plans"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/designs"), { recursive: true });

    const fix = fixes.find((f) => f.checkId === "thoughts-dirs")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("FIXED");
    expect(result.message).toContain("Created 1 missing thoughts/ directory");
  });

  it("should return SKIPPED when all directories already exist", async () => {
    mkdirSync(join(tempDir, "thoughts/ledgers"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/plans"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/shared/designs"), { recursive: true });
    mkdirSync(join(tempDir, "thoughts/brainstorms"), { recursive: true });

    const fix = fixes.find((f) => f.checkId === "thoughts-dirs")!;
    const result = await fix.run(tempDir, false);

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toContain("already exist");
  });

  it("should be idempotent: second run returns SKIPPED", async () => {
    const fix = fixes.find((f) => f.checkId === "thoughts-dirs")!;

    const first = await fix.run(tempDir, false);
    expect(first.status).toBe("FIXED");

    const second = await fix.run(tempDir, false);
    expect(second.status).toBe("SKIPPED");
  });
});
