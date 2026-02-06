export type CheckStatus = "PASS" | "WARN" | "FAIL";

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  message: string;
  detail?: string;
  fixable: boolean;
  component: "cli" | "plugin" | "opencode" | "config";
}

export interface DiagnosticCheck {
  id: string;
  name: string;
  component: "cli" | "plugin" | "opencode" | "config";
  run: (projectDir: string) => Promise<CheckResult>;
}

export const checks: DiagnosticCheck[] = [];

export async function runAllChecks(projectDir: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    try {
      const result = await check.run(projectDir);
      results.push(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: check.id,
        name: check.name,
        status: "FAIL",
        message: `Check threw an error: ${message}`,
        detail: error instanceof Error ? error.stack : undefined,
        fixable: false,
        component: check.component,
      });
    }
  }

  return results;
}
