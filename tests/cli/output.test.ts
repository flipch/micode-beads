import { describe, expect, it } from "bun:test";

import type { CheckResult } from "../../src/cli/doctor-checks";
import type { FixResult } from "../../src/cli/doctor-fixes";
import {
  detectOutputOptions,
  formatCheckResult,
  formatDoctorReport,
  formatFixResult,
  type OutputOptions,
} from "../../src/cli/output";

function makeCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: "test-check",
    name: "Test Check",
    status: "PASS",
    message: "All good",
    fixable: false,
    component: "cli",
    ...overrides,
  };
}

function makeFixResult(overrides: Partial<FixResult> = {}): FixResult {
  return {
    checkId: "test-check",
    status: "FIXED",
    message: "Fixed the issue",
    ...overrides,
  };
}

describe("detectOutputOptions", () => {
  const originalIsTTY = process.stdout.isTTY;

  it("should enable color when TTY, no NO_COLOR, and no --json", () => {
    delete process.env.NO_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

    const opts = detectOutputOptions({});
    expect(opts.color).toBe(true);
    expect(opts.json).toBe(false);

    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  it("should disable color when --json is set", () => {
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    delete process.env.NO_COLOR;

    const opts = detectOutputOptions({ json: true });
    expect(opts.color).toBe(false);
    expect(opts.json).toBe(true);

    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  it("should disable color when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

    const opts = detectOutputOptions({});
    expect(opts.color).toBe(false);

    delete process.env.NO_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  it("should disable color when not a TTY", () => {
    delete process.env.NO_COLOR;
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

    const opts = detectOutputOptions({});
    expect(opts.color).toBe(false);

    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
  });

  it("should set verbose from flags", () => {
    const opts = detectOutputOptions({ verbose: true });
    expect(opts.verbose).toBe(true);
  });

  it("should default verbose to false", () => {
    const opts = detectOutputOptions({});
    expect(opts.verbose).toBe(false);
  });
});

describe("formatCheckResult", () => {
  const plainOpts: OutputOptions = { color: false, json: false, verbose: false };
  const colorOpts: OutputOptions = { color: true, json: false, verbose: false };
  const verboseOpts: OutputOptions = { color: false, json: false, verbose: true };

  it("should format PASS in plain mode", () => {
    const result = makeCheckResult({ status: "PASS", name: "Bun Runtime", message: "Found v1.2.0" });
    const output = formatCheckResult(result, plainOpts);
    expect(output).toBe("[PASS] Bun Runtime: Found v1.2.0");
  });

  it("should format WARN in plain mode", () => {
    const result = makeCheckResult({ status: "WARN", name: "PATH", message: "Not optimal" });
    const output = formatCheckResult(result, plainOpts);
    expect(output).toBe("[WARN] PATH: Not optimal");
  });

  it("should format FAIL in plain mode", () => {
    const result = makeCheckResult({ status: "FAIL", name: "Git", message: "Not found" });
    const output = formatCheckResult(result, plainOpts);
    expect(output).toBe("[FAIL] Git: Not found");
  });

  it("should use color indicators in color mode for PASS", () => {
    const result = makeCheckResult({ status: "PASS", name: "Check", message: "OK" });
    const output = formatCheckResult(result, colorOpts);
    expect(output).toContain("\x1b[32m");
    expect(output).toContain("\u2714");
    expect(output).toContain("Check: OK");
  });

  it("should use color indicators in color mode for WARN", () => {
    const result = makeCheckResult({ status: "WARN", name: "Check", message: "Warning" });
    const output = formatCheckResult(result, colorOpts);
    expect(output).toContain("\x1b[33m");
    expect(output).toContain("\u26A0");
  });

  it("should use color indicators in color mode for FAIL", () => {
    const result = makeCheckResult({ status: "FAIL", name: "Check", message: "Bad" });
    const output = formatCheckResult(result, colorOpts);
    expect(output).toContain("\x1b[31m");
    expect(output).toContain("\u2718");
  });

  it("should include detail in verbose mode", () => {
    const result = makeCheckResult({
      name: "Check",
      message: "Failed",
      detail: "Expected version >= 1.0.0",
    });
    const output = formatCheckResult(result, verboseOpts);
    expect(output).toContain("Expected version >= 1.0.0");
  });

  it("should not include detail when verbose is false", () => {
    const result = makeCheckResult({
      name: "Check",
      message: "Failed",
      detail: "Extra info",
    });
    const output = formatCheckResult(result, plainOpts);
    expect(output).not.toContain("Extra info");
  });
});

describe("formatFixResult", () => {
  const plainOpts: OutputOptions = { color: false, json: false, verbose: false };
  const colorOpts: OutputOptions = { color: true, json: false, verbose: false };

  it("should format FIXED in plain mode", () => {
    const result = makeFixResult({ status: "FIXED", message: "Created missing directory" });
    const output = formatFixResult(result, plainOpts);
    expect(output).toBe("[FIXED] Created missing directory");
  });

  it("should format SKIPPED in plain mode", () => {
    const result = makeFixResult({ status: "SKIPPED", message: "Already configured" });
    const output = formatFixResult(result, plainOpts);
    expect(output).toBe("[SKIPPED] Already configured");
  });

  it("should format MANUAL in plain mode", () => {
    const result = makeFixResult({
      status: "MANUAL",
      message: "Cannot auto-fix",
      action: "Install Bun manually",
    });
    const output = formatFixResult(result, plainOpts);
    expect(output).toContain("[MANUAL] Cannot auto-fix");
    expect(output).toContain("Install Bun manually");
  });

  it("should use color for FIXED status", () => {
    const result = makeFixResult({ status: "FIXED", message: "Done" });
    const output = formatFixResult(result, colorOpts);
    expect(output).toContain("\x1b[32m[FIXED]\x1b[0m");
  });

  it("should use color for SKIPPED status", () => {
    const result = makeFixResult({ status: "SKIPPED", message: "OK" });
    const output = formatFixResult(result, colorOpts);
    expect(output).toContain("\x1b[90m[SKIPPED]\x1b[0m");
  });

  it("should use color for MANUAL status", () => {
    const result = makeFixResult({ status: "MANUAL", message: "Needs user" });
    const output = formatFixResult(result, colorOpts);
    expect(output).toContain("\x1b[33m[MANUAL]\x1b[0m");
  });

  it("should include action string when present", () => {
    const result = makeFixResult({ message: "Fix it", action: "Run: npm install" });
    const output = formatFixResult(result, plainOpts);
    expect(output).toContain("Run: npm install");
  });
});

describe("formatDoctorReport", () => {
  const plainOpts: OutputOptions = { color: false, json: false, verbose: false };
  const jsonOpts: OutputOptions = { color: false, json: true, verbose: false };

  it("should format a passing report in plain mode", () => {
    const checks = [makeCheckResult({ status: "PASS", name: "Bun", message: "OK" })];
    const output = formatDoctorReport(checks, undefined, plainOpts, "1.2.0");
    expect(output).toContain("micode-beads doctor");
    expect(output).toContain("[PASS] Bun: OK");
    expect(output).toContain("All checks passed.");
  });

  it("should show failure summary when checks fail", () => {
    const checks = [
      makeCheckResult({ status: "PASS", name: "Bun", message: "OK" }),
      makeCheckResult({ status: "FAIL", name: "Git", message: "Not found" }),
    ];
    const output = formatDoctorReport(checks, undefined, plainOpts, "1.2.0");
    expect(output).toContain("Some checks failed");
    expect(output).toContain("micode-beads doctor --fix");
  });

  it("should show warning summary when only warnings", () => {
    const checks = [
      makeCheckResult({ status: "PASS", name: "Bun", message: "OK" }),
      makeCheckResult({ status: "WARN", name: "PATH", message: "Suboptimal" }),
    ];
    const output = formatDoctorReport(checks, undefined, plainOpts, "1.2.0");
    expect(output).toContain("All checks passed with warnings.");
  });

  it("should include fix results when present", () => {
    const checks = [makeCheckResult({ status: "FAIL", name: "Dir", message: "Missing" })];
    const fixes = [makeFixResult({ status: "FIXED", message: "Created directory" })];
    const output = formatDoctorReport(checks, fixes, plainOpts, "1.2.0");
    expect(output).toContain("Fixes:");
    expect(output).toContain("[FIXED] Created directory");
  });

  it("should produce valid JSON in json mode", () => {
    const checks = [
      makeCheckResult({ id: "bun-runtime", status: "PASS", name: "Bun", message: "OK", component: "cli" }),
      makeCheckResult({
        id: "git",
        status: "FAIL",
        name: "Git",
        message: "Not found",
        component: "cli",
        fixable: false,
      }),
    ];
    const output = formatDoctorReport(checks, undefined, jsonOpts, "1.2.0");
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe("1.2.0");
    expect(parsed.overall).toBe("fail");
    expect(parsed.checks).toHaveLength(2);
    expect(parsed.checks[0].id).toBe("bun-runtime");
    expect(parsed.checks[0].status).toBe("PASS");
    expect(parsed.checks[1].status).toBe("FAIL");
    expect(parsed.timestamp).toBeDefined();
  });

  it("should include fixes in JSON output when present", () => {
    const checks = [makeCheckResult({ id: "dir-check", status: "FAIL" })];
    const fixes = [makeFixResult({ checkId: "dir-check", status: "FIXED", message: "Created" })];
    const output = formatDoctorReport(checks, fixes, jsonOpts, "1.2.0");
    const parsed = JSON.parse(output);
    expect(parsed.fixes).toBeDefined();
    expect(parsed.fixes).toHaveLength(1);
    expect(parsed.fixes[0].checkId).toBe("dir-check");
    expect(parsed.fixes[0].status).toBe("FIXED");
  });

  it("should set overall to pass when all checks pass in JSON", () => {
    const checks = [makeCheckResult({ status: "PASS" }), makeCheckResult({ status: "WARN" })];
    const output = formatDoctorReport(checks, undefined, jsonOpts, "1.0.0");
    const parsed = JSON.parse(output);
    expect(parsed.overall).toBe("pass");
  });

  it("should not include detail in JSON when not present", () => {
    const checks = [makeCheckResult({ id: "test", detail: undefined })];
    const output = formatDoctorReport(checks, undefined, jsonOpts, "1.0.0");
    const parsed = JSON.parse(output);
    expect("detail" in parsed.checks[0]).toBe(false);
  });
});
