import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { CheckResult } from "./doctor-checks";

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

export const fixes: DiagnosticFix[] = [];

export async function runFixes(
  failedChecks: CheckResult[],
  projectDir: string,
  interactive: boolean,
): Promise<FixResult[]> {
  const results: FixResult[] = [];

  for (const check of failedChecks) {
    if (!check.fixable) {
      continue;
    }

    const fix = fixes.find((f) => f.checkId === check.id);
    if (!fix) {
      continue;
    }

    try {
      if (fix.isDestructive && !interactive) {
        results.push({
          checkId: fix.checkId,
          status: "MANUAL",
          message: `Skipped destructive fix for ${check.name} in non-interactive mode`,
          action: check.detail || "Run interactively to apply this fix.",
        });
        continue;
      }

      const result = await fix.run(projectDir, interactive);
      results.push(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        checkId: fix.checkId,
        status: "MANUAL",
        message: `Fix failed: ${message}`,
        action: "Resolve this issue manually.",
      });
    }
  }

  return results;
}

const THOUGHTS_DIRS = [
  "thoughts/ledgers",
  "thoughts/shared/plans",
  "thoughts/shared/designs",
  "thoughts/brainstorms",
] as const;

function parseJsonFile(filePath: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    const content = readFileSync(filePath, "utf-8");
    return { ok: true, data: JSON.parse(content) };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}

function detectShellConfigPath(): string | null {
  const home = homedir();
  const shell = process.env.SHELL || "";

  if (shell.includes("zsh")) {
    return join(home, ".zshrc");
  }

  if (shell.includes("bash")) {
    const bashrc = join(home, ".bashrc");
    if (existsSync(bashrc)) return bashrc;
    const profile = join(home, ".bash_profile");
    if (existsSync(profile)) return profile;
    return bashrc;
  }

  const profile = join(home, ".profile");
  if (existsSync(profile)) return profile;
  return null;
}

const pathCorrectFix: DiagnosticFix = {
  checkId: "path-correct",
  isDestructive: false,
  run: async (_projectDir: string, _interactive: boolean): Promise<FixResult> => {
    const shellConfig = detectShellConfigPath();
    const suggestedPaths = ["~/.local/bin", "~/.bun/bin"];

    if (shellConfig) {
      return {
        checkId: "path-correct",
        status: "MANUAL",
        message: "micode-beads is not in PATH",
        action: `Add one of these directories to your PATH in ${shellConfig}:\n      ${suggestedPaths.join(" or ")}\n    Then restart your shell or run: source ${shellConfig}`,
      };
    }

    return {
      checkId: "path-correct",
      status: "MANUAL",
      message: "micode-beads is not in PATH",
      action: `Add one of these directories to your PATH:\n      ${suggestedPaths.join(" or ")}\n    Then restart your shell.`,
    };
  },
};

const opencodeJsonExistsFix: DiagnosticFix = {
  checkId: "opencode-json-exists",
  isDestructive: false,
  run: async (projectDir: string, _interactive: boolean): Promise<FixResult> => {
    const configPath = join(projectDir, "opencode.json");

    if (existsSync(configPath)) {
      return {
        checkId: "opencode-json-exists",
        status: "SKIPPED",
        message: "opencode.json already exists",
      };
    }

    const config = {
      plugin: {
        "micode-beads": {},
      },
    };

    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    return {
      checkId: "opencode-json-exists",
      status: "FIXED",
      message: "Created opencode.json with micode-beads plugin",
      action: `Created ${configPath}`,
    };
  },
};

const opencodeJsonValidFix: DiagnosticFix = {
  checkId: "opencode-json-valid",
  isDestructive: true,
  run: async (projectDir: string, _interactive: boolean): Promise<FixResult> => {
    const configPath = join(projectDir, "opencode.json");

    if (!existsSync(configPath)) {
      return {
        checkId: "opencode-json-valid",
        status: "SKIPPED",
        message: "opencode.json does not exist (nothing to repair)",
      };
    }

    const result = parseJsonFile(configPath);
    if (result.ok) {
      if (typeof result.data === "object" && result.data !== null && !Array.isArray(result.data)) {
        return {
          checkId: "opencode-json-valid",
          status: "SKIPPED",
          message: "opencode.json is already valid",
        };
      }
    }

    const backupPath = `${configPath}.backup`;
    const originalContent = readFileSync(configPath, "utf-8");
    writeFileSync(backupPath, originalContent);

    const freshConfig = {
      plugin: {
        "micode-beads": {},
      },
    };

    writeFileSync(configPath, `${JSON.stringify(freshConfig, null, 2)}\n`);

    return {
      checkId: "opencode-json-valid",
      status: "FIXED",
      message: "Replaced malformed opencode.json with valid configuration",
      action: `Original backed up to ${backupPath}`,
    };
  },
};

const pluginRegisteredFix: DiagnosticFix = {
  checkId: "plugin-registered",
  isDestructive: false,
  run: async (projectDir: string, _interactive: boolean): Promise<FixResult> => {
    const configPath = join(projectDir, "opencode.json");

    if (!existsSync(configPath)) {
      return {
        checkId: "plugin-registered",
        status: "MANUAL",
        message: "Cannot register plugin: opencode.json does not exist",
        action: "Run `micode-beads doctor --fix` to create opencode.json first.",
      };
    }

    const result = parseJsonFile(configPath);
    if (!result.ok) {
      return {
        checkId: "plugin-registered",
        status: "MANUAL",
        message: "Cannot register plugin: opencode.json contains invalid JSON",
        action: "Fix opencode.json first, then re-run `micode-beads doctor --fix`.",
      };
    }

    const config = result.data as Record<string, unknown>;

    if (config.plugin) {
      if (Array.isArray(config.plugin)) {
        if (config.plugin.includes("micode-beads")) {
          return {
            checkId: "plugin-registered",
            status: "SKIPPED",
            message: "micode-beads is already registered in opencode.json",
          };
        }
        config.plugin.push("micode-beads");
      } else if (typeof config.plugin === "object" && config.plugin !== null) {
        const pluginObj = config.plugin as Record<string, unknown>;
        if ("micode-beads" in pluginObj) {
          return {
            checkId: "plugin-registered",
            status: "SKIPPED",
            message: "micode-beads is already registered in opencode.json",
          };
        }
        pluginObj["micode-beads"] = {};
      } else {
        config.plugin = { "micode-beads": {} };
      }
    } else {
      config.plugin = { "micode-beads": {} };
    }

    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    return {
      checkId: "plugin-registered",
      status: "FIXED",
      message: "Added micode-beads to opencode.json plugin section",
      action: `Updated ${configPath}`,
    };
  },
};

const micodeJsonValidFix: DiagnosticFix = {
  checkId: "micode-json-valid",
  isDestructive: false,
  run: async (projectDir: string, _interactive: boolean): Promise<FixResult> => {
    const configPath = join(projectDir, "micode-beads.json");

    if (!existsSync(configPath)) {
      return {
        checkId: "micode-json-valid",
        status: "SKIPPED",
        message: "micode-beads.json does not exist (optional file)",
      };
    }

    const result = parseJsonFile(configPath);
    if (!result.ok) {
      return {
        checkId: "micode-json-valid",
        status: "MANUAL",
        message: "micode-beads.json contains invalid JSON",
        action: "Fix the JSON syntax in micode-beads.json manually, then re-run `micode-beads doctor`.",
      };
    }

    if (typeof result.data !== "object" || result.data === null || Array.isArray(result.data)) {
      return {
        checkId: "micode-json-valid",
        status: "MANUAL",
        message: "micode-beads.json must be a JSON object",
        action: "Replace the contents of micode-beads.json with a valid JSON object (e.g., {}).",
      };
    }

    const data = result.data as Record<string, unknown>;
    const issues: string[] = [];

    if (
      data.agents !== undefined &&
      (typeof data.agents !== "object" || data.agents === null || Array.isArray(data.agents))
    ) {
      issues.push('"agents" should be an object (e.g., { "commander": { "model": "..." } })');
    }

    if (
      data.features !== undefined &&
      (typeof data.features !== "object" || data.features === null || Array.isArray(data.features))
    ) {
      issues.push('"features" should be an object (e.g., { "mindmodelInjection": true })');
    }

    if (data.compactionThreshold !== undefined) {
      if (
        typeof data.compactionThreshold !== "number" ||
        data.compactionThreshold < 0 ||
        data.compactionThreshold > 1
      ) {
        issues.push('"compactionThreshold" should be a number between 0 and 1 (e.g., 0.7)');
      }
    }

    if (
      data.fragments !== undefined &&
      (typeof data.fragments !== "object" || data.fragments === null || Array.isArray(data.fragments))
    ) {
      issues.push('"fragments" should be an object');
    }

    if (data.methodology !== undefined && typeof data.methodology !== "string") {
      issues.push('"methodology" should be a string (e.g., "default")');
    }

    if (data.researchDirs !== undefined && !Array.isArray(data.researchDirs)) {
      issues.push('"researchDirs" should be an array (e.g., ["docs/research"])');
    }

    if (data.afk !== undefined && typeof data.afk !== "boolean") {
      issues.push('"afk" should be a boolean (true or false)');
    }

    if (issues.length === 0) {
      return {
        checkId: "micode-json-valid",
        status: "SKIPPED",
        message: "micode-beads.json has no schema issues",
      };
    }

    return {
      checkId: "micode-json-valid",
      status: "MANUAL",
      message: `micode-beads.json has ${issues.length} schema ${issues.length === 1 ? "issue" : "issues"}`,
      action: `Fix the following in micode-beads.json:\n${issues.map((i) => `      - ${i}`).join("\n")}`,
    };
  },
};

const thoughtsDirsFix: DiagnosticFix = {
  checkId: "thoughts-dirs",
  isDestructive: false,
  run: async (projectDir: string, _interactive: boolean): Promise<FixResult> => {
    const missing: string[] = [];

    for (const dir of THOUGHTS_DIRS) {
      const fullPath = join(projectDir, dir);
      if (!existsSync(fullPath)) {
        missing.push(dir);
      }
    }

    if (missing.length === 0) {
      return {
        checkId: "thoughts-dirs",
        status: "SKIPPED",
        message: "All thoughts/ directories already exist",
      };
    }

    for (const dir of missing) {
      const fullPath = join(projectDir, dir);
      mkdirSync(fullPath, { recursive: true });
    }

    return {
      checkId: "thoughts-dirs",
      status: "FIXED",
      message: `Created ${missing.length} missing thoughts/ ${missing.length === 1 ? "directory" : "directories"}`,
      action: `Created: ${missing.join(", ")}`,
    };
  },
};

fixes.push(
  pathCorrectFix,
  opencodeJsonExistsFix,
  opencodeJsonValidFix,
  pluginRegisteredFix,
  micodeJsonValidFix,
  thoughtsDirsFix,
);
