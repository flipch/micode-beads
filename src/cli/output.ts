import type { CheckResult } from "./doctor-checks";
import type { FixResult } from "./doctor-fixes";

export interface OutputOptions {
  color: boolean;
  json: boolean;
  verbose: boolean;
}

export interface CliJsonOutput<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string; suggestion?: string };
}

export function detectOutputOptions(flags: { json?: boolean; verbose?: boolean }): OutputOptions {
  const json = flags.json === true;
  const noColor = "NO_COLOR" in process.env;
  const isTTY = process.stdout.isTTY === true;
  const color = !json && !noColor && isTTY;

  return {
    color,
    json,
    verbose: flags.verbose === true,
  };
}

export function writeJsonOutput<T>(data: T, success: boolean): void {
  const output: CliJsonOutput<T> = { success, data };
  console.log(JSON.stringify(output, null, 2));
}

export function writeJsonError(code: string, message: string, suggestion?: string): void {
  const output: CliJsonOutput<null> = {
    success: false,
    data: null,
    error: { code, message, ...(suggestion ? { suggestion } : {}) },
  };
  console.log(JSON.stringify(output, null, 2));
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function formatTable(headers: string[], rows: string[][], options: OutputOptions): string {
  const widths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, stripAnsi(row[i] ?? "").length), 0);
    return Math.max(h.length, maxData);
  });

  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  const dataLines = rows.map((row) =>
    row
      .map((cell, i) => {
        const visibleLen = stripAnsi(cell).length;
        const padding = Math.max(0, widths[i] - visibleLen);
        return cell + " ".repeat(padding);
      })
      .join("  "),
  );

  if (options.color) {
    const colorHeader = `\x1b[1m${headerLine}\x1b[0m`;
    return [colorHeader, separator, ...dataLines].join("\n");
  }

  return [headerLine, separator, ...dataLines].join("\n");
}

const PASS_COLOR = "\x1b[32m\u2714\x1b[0m";
const WARN_COLOR = "\x1b[33m\u26A0\x1b[0m";
const FAIL_COLOR = "\x1b[31m\u2718\x1b[0m";

const PASS_PLAIN = "[PASS]";
const WARN_PLAIN = "[WARN]";
const FAIL_PLAIN = "[FAIL]";

function statusIndicator(status: "PASS" | "WARN" | "FAIL", color: boolean): string {
  if (color) {
    switch (status) {
      case "PASS":
        return PASS_COLOR;
      case "WARN":
        return WARN_COLOR;
      case "FAIL":
        return FAIL_COLOR;
    }
  }
  switch (status) {
    case "PASS":
      return PASS_PLAIN;
    case "WARN":
      return WARN_PLAIN;
    case "FAIL":
      return FAIL_PLAIN;
  }
}

export function formatCheckResult(result: CheckResult, options: OutputOptions): string {
  const indicator = statusIndicator(result.status, options.color);
  let line = `${indicator} ${result.name}: ${result.message}`;
  if (options.verbose && result.detail) {
    line += `\n    ${result.detail}`;
  }
  return line;
}

export function formatFixResult(result: FixResult, options: OutputOptions): string {
  const statusLabel = options.color ? colorizeFixStatus(result.status) : `[${result.status}]`;
  let line = `${statusLabel} ${result.message}`;
  if (result.action) {
    line += `\n    ${result.action}`;
  }
  return line;
}

function colorizeFixStatus(status: "FIXED" | "SKIPPED" | "MANUAL"): string {
  switch (status) {
    case "FIXED":
      return "\x1b[32m[FIXED]\x1b[0m";
    case "SKIPPED":
      return "\x1b[90m[SKIPPED]\x1b[0m";
    case "MANUAL":
      return "\x1b[33m[MANUAL]\x1b[0m";
  }
}

export interface DoctorJsonOutput {
  version: string;
  timestamp: string;
  overall: "pass" | "fail";
  checks: Array<{
    id: string;
    name: string;
    status: "PASS" | "WARN" | "FAIL";
    component: string;
    message: string;
    detail?: string;
    fixable: boolean;
  }>;
  fixes?: Array<{
    checkId: string;
    status: "FIXED" | "SKIPPED" | "MANUAL";
    message: string;
  }>;
}

export function formatDoctorReport(
  results: CheckResult[],
  fixes: FixResult[] | undefined,
  options: OutputOptions,
  version: string,
): string {
  if (options.json) {
    return formatDoctorJson(results, fixes, version);
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(options.color ? "\x1b[1mmicode-beads doctor\x1b[0m" : "micode-beads doctor");
  lines.push("");

  for (const result of results) {
    lines.push(`  ${formatCheckResult(result, options)}`);
  }

  if (fixes && fixes.length > 0) {
    lines.push("");
    lines.push(options.color ? "\x1b[1mFixes:\x1b[0m" : "Fixes:");
    lines.push("");
    for (const fix of fixes) {
      lines.push(`  ${formatFixResult(fix, options)}`);
    }
  }

  const hasFail = results.some((r) => r.status === "FAIL");
  const hasWarn = results.some((r) => r.status === "WARN");

  lines.push("");
  if (hasFail) {
    const msg = "Some checks failed. Run `micode-beads doctor --fix` to attempt auto-repair.";
    lines.push(options.color ? `\x1b[31m${msg}\x1b[0m` : msg);
  } else if (hasWarn) {
    const msg = "All checks passed with warnings.";
    lines.push(options.color ? `\x1b[33m${msg}\x1b[0m` : msg);
  } else {
    const msg = "All checks passed.";
    lines.push(options.color ? `\x1b[32m${msg}\x1b[0m` : msg);
  }
  lines.push("");

  return lines.join("\n");
}

function formatDoctorJson(results: CheckResult[], fixes: FixResult[] | undefined, version: string): string {
  const hasFail = results.some((r) => r.status === "FAIL");
  const output: DoctorJsonOutput = {
    version,
    timestamp: new Date().toISOString(),
    overall: hasFail ? "fail" : "pass",
    checks: results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      component: r.component,
      message: r.message,
      ...(r.detail ? { detail: r.detail } : {}),
      fixable: r.fixable,
    })),
  };

  if (fixes && fixes.length > 0) {
    output.fixes = fixes.map((f) => ({
      checkId: f.checkId,
      status: f.status,
      message: f.message,
    }));
  }

  return JSON.stringify(output, null, 2);
}
