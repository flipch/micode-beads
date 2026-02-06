export type ErrorComponent = "cli" | "plugin" | "opencode" | "config";

export interface AttributedError {
  component: ErrorComponent;
  message: string;
  suggestion?: string;
}

export function createAttributedError(
  component: ErrorComponent,
  message: string,
  suggestion?: string,
): AttributedError {
  return { component, message, suggestion };
}

export function createAmbiguousError(message: string): AttributedError {
  return {
    component: "cli",
    message,
    suggestion: "Unable to determine the source of this error. Run `micode-beads doctor` to diagnose your setup.",
  };
}

export function formatAttributedError(error: AttributedError, color: boolean): string {
  const label = color ? `\x1b[31m[${error.component}]\x1b[0m` : `[${error.component}]`;
  let output = `${label} Error: ${error.message}`;
  if (error.suggestion) {
    output += `\n  Suggestion: ${error.suggestion}`;
  }
  return output;
}

export function printError(error: AttributedError, color?: boolean): void {
  const useColor = color !== undefined ? color : process.stderr.isTTY === true && !("NO_COLOR" in process.env);
  console.error(formatAttributedError(error, useColor));
}
