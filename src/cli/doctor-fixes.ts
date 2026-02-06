export type FixStatus = "FIXED" | "SKIPPED" | "MANUAL";

export interface FixResult {
  checkId: string;
  status: FixStatus;
  message: string;
  action?: string;
}

export interface DiagnosticFix {
  checkId: string;
  isDestructive: boolean;
  run: (projectDir: string, interactive: boolean) => Promise<FixResult>;
}
