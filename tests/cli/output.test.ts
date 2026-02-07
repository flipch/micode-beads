import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { CheckResult } from "../../src/cli/doctor-checks";
import type { FixResult } from "../../src/cli/doctor-fixes";
import {
  type CliJsonOutput,
  detectOutputOptions,
  formatCheckResult,
  formatDoctorReport,
  formatFixResult,
  formatTable,
  type OutputOptions,
  writeJsonError,
  writeJsonOutput,
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

describe("writeJsonOutput", () => {
  let captured: string[];
  const originalLog = console.log;

  beforeEach(() => {
    captured = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it("should write success JSON with data to stdout", () => {
    writeJsonOutput({ name: "test", count: 42 }, true);
    expect(captured).toHaveLength(1);
    const parsed: CliJsonOutput<{ name: string; count: number }> = JSON.parse(captured[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ name: "test", count: 42 });
    expect(parsed.error).toBeUndefined();
  });

  it("should write failure JSON with data", () => {
    writeJsonOutput(null, false);
    const parsed: CliJsonOutput<null> = JSON.parse(captured[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.data).toBeNull();
  });

  it("should write pretty-printed JSON (indented)", () => {
    writeJsonOutput({ x: 1 }, true);
    expect(captured[0]).toContain("\n");
    expect(captured[0]).toContain("  ");
  });

  it("should handle array data", () => {
    writeJsonOutput([1, 2, 3], true);
    const parsed: CliJsonOutput<number[]> = JSON.parse(captured[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual([1, 2, 3]);
  });

  it("should handle empty object data", () => {
    writeJsonOutput({}, true);
    const parsed: CliJsonOutput<Record<string, never>> = JSON.parse(captured[0]);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({});
  });
});

describe("writeJsonError", () => {
  let captured: string[];
  const originalLog = console.log;

  beforeEach(() => {
    captured = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it("should write error JSON with code and message", () => {
    writeJsonError("NOT_FOUND", "Resource not found");
    const parsed: CliJsonOutput<null> = JSON.parse(captured[0]);
    expect(parsed.success).toBe(false);
    expect(parsed.data).toBeNull();
    expect(parsed.error).toBeDefined();
    expect(parsed.error!.code).toBe("NOT_FOUND");
    expect(parsed.error!.message).toBe("Resource not found");
    expect(parsed.error!.suggestion).toBeUndefined();
  });

  it("should include suggestion when provided", () => {
    writeJsonError("INVALID_INPUT", "Bad input", "Check the --help output.");
    const parsed: CliJsonOutput<null> = JSON.parse(captured[0]);
    expect(parsed.error!.suggestion).toBe("Check the --help output.");
  });

  it("should omit suggestion field when not provided", () => {
    writeJsonError("ERR", "Something broke");
    const parsed = JSON.parse(captured[0]);
    expect("suggestion" in parsed.error).toBe(false);
  });

  it("should produce valid parseable JSON", () => {
    writeJsonError("CODE", "msg", "hint");
    expect(() => JSON.parse(captured[0])).not.toThrow();
  });
});

describe("formatTable", () => {
  const plainOpts: OutputOptions = { color: false, json: false, verbose: false };
  const colorOpts: OutputOptions = { color: true, json: false, verbose: false };

  it("should render headers, separator, and data rows", () => {
    const headers = ["Name", "Value"];
    const rows = [
      ["alpha", "1"],
      ["beta", "2"],
    ];
    const output = formatTable(headers, rows, plainOpts);
    const lines = output.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Value");
    expect(lines[1]).toMatch(/^-+\s+-+$/);
    expect(lines[2]).toContain("alpha");
    expect(lines[2]).toContain("1");
    expect(lines[3]).toContain("beta");
    expect(lines[3]).toContain("2");
  });

  it("should calculate column widths based on widest content", () => {
    const headers = ["ID", "Description"];
    const rows = [
      ["1", "short"],
      ["2", "a much longer description here"],
    ];
    const output = formatTable(headers, rows, plainOpts);
    const lines = output.split("\n");
    const separatorParts = lines[1].split("  ");
    expect(separatorParts[1].length).toBeGreaterThanOrEqual("a much longer description here".length);
  });

  it("should use header width when header is wider than data", () => {
    const headers = ["LongHeaderName", "X"];
    const rows = [["a", "1"]];
    const output = formatTable(headers, rows, plainOpts);
    const lines = output.split("\n");
    expect(lines[0].startsWith("LongHeaderName")).toBe(true);
    const separatorParts = lines[1].split("  ");
    expect(separatorParts[0].length).toBe("LongHeaderName".length);
  });

  it("should bold headers in color mode", () => {
    const headers = ["Name", "Value"];
    const rows = [["a", "1"]];
    const output = formatTable(headers, rows, colorOpts);
    const lines = output.split("\n");
    expect(lines[0]).toContain("\x1b[1m");
    expect(lines[0]).toContain("\x1b[0m");
  });

  it("should not include ANSI codes in plain mode headers", () => {
    const headers = ["Name"];
    const rows = [["val"]];
    const output = formatTable(headers, rows, plainOpts);
    expect(output).not.toContain("\x1b[");
  });

  it("should handle empty rows", () => {
    const headers = ["Name", "Value"];
    const output = formatTable(headers, [], plainOpts);
    const lines = output.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Name");
    expect(lines[1]).toMatch(/^-+/);
  });

  it("should handle cells with ANSI color codes and still align correctly", () => {
    const headers = ["Status", "Name"];
    const rows = [
      ["\x1b[32mcompleted\x1b[0m", "task-a"],
      ["pending", "task-b"],
    ];
    const output = formatTable(headers, rows, plainOpts);
    const lines = output.split("\n");
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
    const nameColStart2 = strip(lines[2]).indexOf("task-a");
    const nameColStart3 = strip(lines[3]).indexOf("task-b");
    expect(nameColStart2).toBe(nameColStart3);
  });

  it("should handle single-column table", () => {
    const headers = ["Item"];
    const rows = [["one"], ["two"], ["three"]];
    const output = formatTable(headers, rows, plainOpts);
    const lines = output.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("Item");
    expect(lines[4]).toContain("three");
  });

  it("should handle missing cells gracefully", () => {
    const headers = ["A", "B", "C"];
    const rows = [["1"]];
    const output = formatTable(headers, rows, plainOpts);
    const lines = output.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("1");
  });
});
