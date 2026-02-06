import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDoctor } from "../../src/cli/doctor";
import { checks, type DiagnosticCheck } from "../../src/cli/doctor-checks";
import { type DiagnosticFix, fixes } from "../../src/cli/doctor-fixes";
import type { DoctorJsonOutput } from "../../src/cli/output";

function setupValidProject(dir: string): void {
  writeFileSync(join(dir, "opencode.json"), JSON.stringify({ plugin: { "micode-beads": {} } }, null, 2));
  mkdirSync(join(dir, "thoughts/ledgers"), { recursive: true });
  mkdirSync(join(dir, "thoughts/shared/plans"), { recursive: true });
  mkdirSync(join(dir, "thoughts/shared/designs"), { recursive: true });
  mkdirSync(join(dir, "thoughts/brainstorms"), { recursive: true });
  mkdirSync(join(dir, ".mindmodel"), { recursive: true });
}

function makePassingCheck(id: string, name: string): DiagnosticCheck {
  return {
    id,
    name,
    component: "cli",
    run: async () => ({
      id,
      name,
      status: "PASS" as const,
      message: `${name} is fine`,
      fixable: false,
      component: "cli" as const,
    }),
  };
}

function makeFailingCheck(id: string, name: string, fixable = true): DiagnosticCheck {
  return {
    id,
    name,
    component: "config",
    run: async () => ({
      id,
      name,
      status: "FAIL" as const,
      message: `${name} has problems`,
      detail: `Details about ${name} failure`,
      fixable,
      component: "config" as const,
    }),
  };
}

function makeWarningCheck(id: string, name: string, fixable = true): DiagnosticCheck {
  return {
    id,
    name,
    component: "config",
    run: async () => ({
      id,
      name,
      status: "WARN" as const,
      message: `${name} has a warning`,
      fixable,
      component: "config" as const,
    }),
  };
}

function captureOutput(): { output: string; writer: (data: string) => void } {
  let output = "";
  return {
    get output() {
      return output;
    },
    writer: (data: string) => {
      output += data;
    },
  };
}

describe("runDoctor orchestrator", () => {
  let savedChecks: DiagnosticCheck[];
  let savedFixes: DiagnosticFix[];
  let tempDir: string;

  beforeEach(() => {
    savedChecks = [...checks];
    savedFixes = [...fixes];
    tempDir = mkdtempSync(join(tmpdir(), "doctor-test-"));
  });

  afterEach(() => {
    checks.length = 0;
    checks.push(...savedChecks);
    fixes.length = 0;
    fixes.push(...savedFixes);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("exit codes", () => {
    it("should return 0 when all checks pass", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makePassingCheck("check-b", "Check B"));

      const cap = captureOutput();
      const exitCode = await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(exitCode).toBe(0);
    });

    it("should return 1 when any check fails", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makeFailingCheck("check-b", "Check B", false));

      const cap = captureOutput();
      const exitCode = await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(exitCode).toBe(1);
    });

    it("should return 0 when checks have warnings but no failures", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makeWarningCheck("check-b", "Check B"));

      const cap = captureOutput();
      const exitCode = await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(exitCode).toBe(0);
    });
  });

  describe("--json mode", () => {
    it("should produce valid JSON output", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makeFailingCheck("check-b", "Check B"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: true, verbose: false }, "2.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(parsed).toBeDefined();
    });

    it("should include all required DoctorJsonOutput fields", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makeFailingCheck("check-b", "Check B"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: true, verbose: false }, "2.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(typeof parsed.version).toBe("string");
      expect(parsed.version).toBe("2.0.0");
      expect(typeof parsed.timestamp).toBe("string");
      expect(parsed.overall).toBe("fail");
      expect(Array.isArray(parsed.checks)).toBe(true);
    });

    it("should include correct check fields in JSON output", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makeFailingCheck("check-b", "Check B"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: true, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(parsed.checks).toHaveLength(2);

      const passing = parsed.checks.find((c) => c.id === "check-a");
      expect(passing).toBeDefined();
      expect(passing!.status).toBe("PASS");
      expect(passing!.name).toBe("Check A");
      expect(typeof passing!.component).toBe("string");
      expect(typeof passing!.message).toBe("string");
      expect(typeof passing!.fixable).toBe("boolean");

      const failing = parsed.checks.find((c) => c.id === "check-b");
      expect(failing).toBeDefined();
      expect(failing!.status).toBe("FAIL");
      expect(typeof failing!.detail).toBe("string");
    });

    it("should set overall to 'pass' when all checks pass", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: true, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(parsed.overall).toBe("pass");
    });

    it("should include ISO 8601 timestamp", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: true, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      const date = new Date(parsed.timestamp);
      expect(date.toISOString()).toBe(parsed.timestamp);
    });

    it("should not include fixes array when --fix is not used", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: true, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(parsed.fixes).toBeUndefined();
    });
  });

  describe("--fix flow", () => {
    it("should run fixes for failing checks and re-verify", async () => {
      let fixCallCount = 0;

      checks.length = 0;
      fixes.length = 0;

      checks.push({
        id: "fixable-check",
        name: "Fixable Check",
        component: "config",
        run: async () => ({
          id: "fixable-check",
          name: "Fixable Check",
          status: fixCallCount > 0 ? ("PASS" as const) : ("FAIL" as const),
          message: fixCallCount > 0 ? "Now fixed" : "Broken",
          fixable: true,
          component: "config" as const,
        }),
      });

      fixes.push({
        checkId: "fixable-check",
        isDestructive: false,
        run: async () => {
          fixCallCount++;
          return { checkId: "fixable-check", status: "FIXED" as const, message: "Applied fix" };
        },
      });

      const cap = captureOutput();
      const exitCode = await runDoctor({ fix: true, json: true, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(fixCallCount).toBe(1);
      expect(exitCode).toBe(0);

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(parsed.overall).toBe("pass");
      expect(parsed.checks[0].status).toBe("PASS");
      expect(parsed.fixes).toBeDefined();
      expect(parsed.fixes).toHaveLength(1);
      expect(parsed.fixes![0].status).toBe("FIXED");
    });

    it("should include fix results in JSON output", async () => {
      checks.length = 0;
      fixes.length = 0;

      checks.push(makeFailingCheck("fix-a", "Fix A"));
      checks.push(makeFailingCheck("fix-b", "Fix B"));

      fixes.push({
        checkId: "fix-a",
        isDestructive: false,
        run: async () => ({ checkId: "fix-a", status: "FIXED" as const, message: "Fixed A" }),
      });

      fixes.push({
        checkId: "fix-b",
        isDestructive: false,
        run: async () => ({ checkId: "fix-b", status: "MANUAL" as const, message: "Needs manual fix" }),
      });

      const cap = captureOutput();
      await runDoctor({ fix: true, json: true, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(parsed.fixes).toBeDefined();
      expect(parsed.fixes).toHaveLength(2);

      const fixA = parsed.fixes!.find((f) => f.checkId === "fix-a");
      expect(fixA!.status).toBe("FIXED");
      expect(fixA!.message).toBe("Fixed A");

      const fixB = parsed.fixes!.find((f) => f.checkId === "fix-b");
      expect(fixB!.status).toBe("MANUAL");
    });

    it("should also attempt fixes for WARN checks", async () => {
      let fixRan = false;

      checks.length = 0;
      fixes.length = 0;

      checks.push(makeWarningCheck("warn-check", "Warning Check"));

      fixes.push({
        checkId: "warn-check",
        isDestructive: false,
        run: async () => {
          fixRan = true;
          return { checkId: "warn-check", status: "FIXED" as const, message: "Fixed warning" };
        },
      });

      const cap = captureOutput();
      await runDoctor({ fix: true, json: false, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      expect(fixRan).toBe(true);
    });

    it("should not run fixes when --fix is not set", async () => {
      let fixRan = false;

      checks.length = 0;
      fixes.length = 0;

      checks.push(makeFailingCheck("check-a", "Check A"));
      fixes.push({
        checkId: "check-a",
        isDestructive: false,
        run: async () => {
          fixRan = true;
          return { checkId: "check-a", status: "FIXED" as const, message: "fixed" };
        },
      });

      const cap = captureOutput();
      await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(fixRan).toBe(false);
    });
  });

  describe("non-interactive mode", () => {
    it("should skip destructive fixes when not interactive", async () => {
      checks.length = 0;
      fixes.length = 0;

      checks.push(makeFailingCheck("destructive-check", "Destructive Check"));

      fixes.push({
        checkId: "destructive-check",
        isDestructive: true,
        run: async () => ({
          checkId: "destructive-check",
          status: "FIXED" as const,
          message: "Should not run",
        }),
      });

      const cap = captureOutput();
      await runDoctor({ fix: true, json: true, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      const parsed = JSON.parse(cap.output.trim()) as DoctorJsonOutput;
      expect(parsed.fixes).toBeDefined();
      expect(parsed.fixes![0].status).toBe("MANUAL");
      expect(parsed.fixes![0].message).toContain("non-interactive");
    });

    it("should produce plain text without color when not a TTY", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makeFailingCheck("check-b", "Check B", false));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(cap.output).toContain("[PASS]");
      expect(cap.output).toContain("[FAIL]");
      expect(cap.output).not.toContain("\x1b[");
    });
  });

  describe("text output format", () => {
    it("should include doctor header in text output", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(cap.output).toContain("micode-beads doctor");
    });

    it("should include check names and messages", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));
      checks.push(makeFailingCheck("check-b", "Check B", false));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(cap.output).toContain("Check A");
      expect(cap.output).toContain("Check B");
    });

    it("should include failure summary when checks fail", async () => {
      checks.length = 0;
      checks.push(makeFailingCheck("check-a", "Check A", false));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(cap.output).toContain("doctor --fix");
    });

    it("should include all-pass message when everything passes", async () => {
      checks.length = 0;
      checks.push(makePassingCheck("check-a", "Check A"));

      const cap = captureOutput();
      await runDoctor({ fix: false, json: false, verbose: false }, "1.0.0", {
        projectDir: tempDir,
        stdout: cap.writer,
      });

      expect(cap.output).toContain("All checks passed");
    });

    it("should include fix results section when --fix produces results", async () => {
      checks.length = 0;
      fixes.length = 0;

      checks.push(makeFailingCheck("fix-target", "Fix Target"));
      fixes.push({
        checkId: "fix-target",
        isDestructive: false,
        run: async () => ({ checkId: "fix-target", status: "FIXED" as const, message: "Applied the fix" }),
      });

      const cap = captureOutput();
      await runDoctor({ fix: true, json: false, verbose: false }, "1.0.0", { projectDir: tempDir, stdout: cap.writer });

      expect(cap.output).toContain("Fixes:");
      expect(cap.output).toContain("Applied the fix");
    });
  });
});

describe("doctor CLI binary integration", () => {
  let tempDir: string;
  const PROJECT_ROOT = "/Users/felipeh/.micode-beads";
  const BUN = `${PROJECT_ROOT}/bin/bun`;
  const CLI_SCRIPT = `${PROJECT_ROOT}/src/cli/index.ts`;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "doctor-cli-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should produce valid JSON with --json flag", async () => {
    setupValidProject(tempDir);

    const proc = Bun.spawn([BUN, "run", CLI_SCRIPT, "doctor", "--json"], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1", PATH: `${PROJECT_ROOT}/bin:${process.env.PATH}` },
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const parsed = JSON.parse(stdout.trim()) as DoctorJsonOutput;
    expect(parsed.version).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.overall).toBeDefined();
    expect(["pass", "fail"]).toContain(parsed.overall);
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks.length).toBeGreaterThan(0);
  });

  it("should have exit code matching overall status", async () => {
    setupValidProject(tempDir);

    const proc = Bun.spawn([BUN, "run", CLI_SCRIPT, "doctor", "--json"], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1", PATH: `${PROJECT_ROOT}/bin:${process.env.PATH}` },
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(stdout.trim()) as DoctorJsonOutput;
    if (parsed.overall === "pass") {
      expect(exitCode).toBe(0);
    } else {
      expect(exitCode).toBe(1);
    }
  });

  it("should exit with code 1 when checks fail", async () => {
    const proc = Bun.spawn([BUN, "run", CLI_SCRIPT, "doctor", "--json"], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1", PATH: `${PROJECT_ROOT}/bin:${process.env.PATH}` },
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(stdout.trim()) as DoctorJsonOutput;
    expect(parsed.overall).toBe("fail");
    expect(exitCode).toBe(1);
  });

  it("should produce no extraneous output with --json", async () => {
    setupValidProject(tempDir);

    const proc = Bun.spawn([BUN, "run", CLI_SCRIPT, "doctor", "--json"], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1", PATH: `${PROJECT_ROOT}/bin:${process.env.PATH}` },
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const trimmed = stdout.trim();
    expect(trimmed.startsWith("{")).toBe(true);
    expect(trimmed.endsWith("}")).toBe(true);
    expect(() => JSON.parse(trimmed)).not.toThrow();
  });

  it("should fix missing directories with --fix --json", async () => {
    writeFileSync(join(tempDir, "opencode.json"), JSON.stringify({ plugin: { "micode-beads": {} } }, null, 2));

    const proc = Bun.spawn([BUN, "run", CLI_SCRIPT, "doctor", "--fix", "--json"], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1", PATH: `${PROJECT_ROOT}/bin:${process.env.PATH}` },
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const parsed = JSON.parse(stdout.trim()) as DoctorJsonOutput;
    expect(parsed.fixes).toBeDefined();
    expect(parsed.fixes!.length).toBeGreaterThan(0);

    const thoughtsFix = parsed.fixes!.find((f) => f.checkId === "thoughts-dirs");
    if (thoughtsFix) {
      expect(thoughtsFix.status).toBe("FIXED");
    }

    const thoughtsCheck = parsed.checks.find((c) => c.id === "thoughts-dirs");
    if (thoughtsCheck) {
      expect(thoughtsCheck.status).toBe("PASS");
    }
  });

  it("should include all 11 checks in JSON output", async () => {
    setupValidProject(tempDir);

    const proc = Bun.spawn([BUN, "run", CLI_SCRIPT, "doctor", "--json"], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1", PATH: `${PROJECT_ROOT}/bin:${process.env.PATH}` },
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const parsed = JSON.parse(stdout.trim()) as DoctorJsonOutput;
    expect(parsed.checks.length).toBe(11);

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

    const actualIds = parsed.checks.map((c) => c.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
  });

  it("should produce plain text output without --json", async () => {
    setupValidProject(tempDir);

    const proc = Bun.spawn([BUN, "run", CLI_SCRIPT, "doctor"], {
      cwd: tempDir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        MICODE_NO_UPDATE_CHECK: "1",
        NO_COLOR: "1",
        PATH: `${PROJECT_ROOT}/bin:${process.env.PATH}`,
      },
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(stdout).toContain("micode-beads doctor");
    expect(stdout).toContain("[PASS]");
    expect(() => JSON.parse(stdout.trim())).toThrow();
  });
});
