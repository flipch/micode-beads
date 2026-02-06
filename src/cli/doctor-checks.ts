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
