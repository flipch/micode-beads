import type { CheckResult } from "./doctor-checks";
import { runAllChecks } from "./doctor-checks";
import type { FixResult } from "./doctor-fixes";
import { runFixes } from "./doctor-fixes";
import { detectOutputOptions, formatDoctorReport } from "./output";

interface DoctorFlags {
  fix: boolean;
  json: boolean;
  verbose: boolean;
}

export async function runDoctor(flags: DoctorFlags, version: string): Promise<number> {
  const projectDir = process.cwd();
  const outputOptions = detectOutputOptions(flags);
  const isInteractive = process.stdin.isTTY === true && process.stdout.isTTY === true;

  let results: CheckResult[] = await runAllChecks(projectDir);

  let fixResults: FixResult[] | undefined;
  if (flags.fix) {
    const failedChecks = results.filter((r) => r.status === "FAIL" || r.status === "WARN");
    fixResults = await runFixes(failedChecks, projectDir, isInteractive);
    results = await runAllChecks(projectDir);
  }

  const report = formatDoctorReport(results, fixResults, outputOptions, version);
  console.log(report);

  const hasFail = results.some((r) => r.status === "FAIL");
  return hasFail ? 1 : 0;
}
