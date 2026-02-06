import type { CheckResult } from "./doctor-checks";
import { runAllChecks } from "./doctor-checks";
import type { FixResult } from "./doctor-fixes";
import { runFixes } from "./doctor-fixes";
import { detectOutputOptions, formatDoctorReport } from "./output";

export interface DoctorFlags {
  fix: boolean;
  json: boolean;
  verbose: boolean;
}

export interface DoctorOptions {
  projectDir?: string;
  stdout?: (data: string) => void;
}

export async function runDoctor(flags: DoctorFlags, version: string, options?: DoctorOptions): Promise<number> {
  const projectDir = options?.projectDir || process.cwd();
  const write = options?.stdout || ((data: string) => process.stdout.write(data));
  const outputOptions = detectOutputOptions(flags);
  const isInteractive = !flags.json && process.stdin.isTTY === true && process.stdout.isTTY === true;

  let results: CheckResult[] = await runAllChecks(projectDir);

  let fixResults: FixResult[] | undefined;
  if (flags.fix) {
    const failedChecks = results.filter((r) => r.status === "FAIL" || r.status === "WARN");
    fixResults = await runFixes(failedChecks, projectDir, isInteractive);
    results = await runAllChecks(projectDir);
  }

  const report = formatDoctorReport(results, fixResults, outputOptions, version);
  write(`${report}\n`);

  const hasFail = results.some((r) => r.status === "FAIL");
  return hasFail ? 1 : 0;
}
