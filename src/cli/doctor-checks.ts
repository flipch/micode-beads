import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { which } from "bun";

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

function hasWriteAccess(dirPath: string): boolean {
  try {
    accessSync(dirPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const bunRuntimeCheck: DiagnosticCheck = {
  id: "bun-runtime",
  name: "Bun Runtime",
  component: "cli",
  run: async () => {
    const bunPath = which("bun");
    if (!bunPath) {
      return {
        id: "bun-runtime",
        name: "Bun Runtime",
        status: "FAIL",
        message: "Bun is not installed or not in PATH",
        detail: "Install Bun: curl -fsSL https://bun.sh/install | bash",
        fixable: false,
        component: "cli",
      };
    }

    return {
      id: "bun-runtime",
      name: "Bun Runtime",
      status: "PASS",
      message: `Bun found at ${bunPath}`,
      fixable: false,
      component: "cli",
    };
  },
};

const opencodeCLICheck: DiagnosticCheck = {
  id: "opencode-cli",
  name: "OpenCode CLI",
  component: "opencode",
  run: async () => {
    const opencodePath = which("opencode");
    if (!opencodePath) {
      return {
        id: "opencode-cli",
        name: "OpenCode CLI",
        status: "FAIL",
        message: "OpenCode CLI is not installed or not in PATH",
        detail: "Install OpenCode: https://opencode.ai/docs/getting-started",
        fixable: false,
        component: "opencode",
      };
    }

    return {
      id: "opencode-cli",
      name: "OpenCode CLI",
      status: "PASS",
      message: `OpenCode found at ${opencodePath}`,
      fixable: false,
      component: "opencode",
    };
  },
};

const gitAvailableCheck: DiagnosticCheck = {
  id: "git-available",
  name: "Git",
  component: "cli",
  run: async () => {
    const gitPath = which("git");
    if (!gitPath) {
      return {
        id: "git-available",
        name: "Git",
        status: "FAIL",
        message: "git is not installed or not in PATH",
        detail: "Install git: https://git-scm.com/downloads",
        fixable: false,
        component: "cli",
      };
    }

    return {
      id: "git-available",
      name: "Git",
      status: "PASS",
      message: `git found at ${gitPath}`,
      fixable: false,
      component: "cli",
    };
  },
};

const pathCorrectCheck: DiagnosticCheck = {
  id: "path-correct",
  name: "PATH",
  component: "cli",
  run: async () => {
    const mcbPath = which("micode-beads");
    if (!mcbPath) {
      return {
        id: "path-correct",
        name: "PATH",
        status: "FAIL",
        message: "micode-beads is not in PATH",
        detail: "Ensure the directory containing micode-beads is in your PATH (e.g., ~/.local/bin or ~/.bun/bin)",
        fixable: true,
        component: "cli",
      };
    }

    return {
      id: "path-correct",
      name: "PATH",
      status: "PASS",
      message: `micode-beads found at ${mcbPath}`,
      fixable: true,
      component: "cli",
    };
  },
};

const opencodeJsonExistsCheck: DiagnosticCheck = {
  id: "opencode-json-exists",
  name: "opencode.json",
  component: "config",
  run: async (projectDir: string) => {
    const configPath = join(projectDir, "opencode.json");
    if (!existsSync(configPath)) {
      return {
        id: "opencode-json-exists",
        name: "opencode.json",
        status: "FAIL",
        message: "opencode.json not found in project root",
        detail: `Expected at: ${configPath}. Run \`micode-beads init\` to create it.`,
        fixable: true,
        component: "config",
      };
    }

    return {
      id: "opencode-json-exists",
      name: "opencode.json",
      status: "PASS",
      message: "opencode.json exists",
      fixable: true,
      component: "config",
    };
  },
};

const opencodeJsonValidCheck: DiagnosticCheck = {
  id: "opencode-json-valid",
  name: "opencode.json Valid",
  component: "config",
  run: async (projectDir: string) => {
    const configPath = join(projectDir, "opencode.json");
    if (!existsSync(configPath)) {
      return {
        id: "opencode-json-valid",
        name: "opencode.json Valid",
        status: "WARN",
        message: "opencode.json does not exist (skipping validation)",
        fixable: true,
        component: "config",
      };
    }

    const result = parseJsonFile(configPath);
    if (!result.ok) {
      return {
        id: "opencode-json-valid",
        name: "opencode.json Valid",
        status: "FAIL",
        message: "opencode.json contains invalid JSON",
        detail: result.error,
        fixable: true,
        component: "config",
      };
    }

    if (typeof result.data !== "object" || result.data === null || Array.isArray(result.data)) {
      return {
        id: "opencode-json-valid",
        name: "opencode.json Valid",
        status: "FAIL",
        message: "opencode.json must be a JSON object",
        detail: `Got ${Array.isArray(result.data) ? "array" : typeof result.data}`,
        fixable: true,
        component: "config",
      };
    }

    return {
      id: "opencode-json-valid",
      name: "opencode.json Valid",
      status: "PASS",
      message: "opencode.json is valid JSON with expected structure",
      fixable: true,
      component: "config",
    };
  },
};

const pluginRegisteredCheck: DiagnosticCheck = {
  id: "plugin-registered",
  name: "Plugin Registered",
  component: "plugin",
  run: async (projectDir: string) => {
    const configPath = join(projectDir, "opencode.json");
    if (!existsSync(configPath)) {
      return {
        id: "plugin-registered",
        name: "Plugin Registered",
        status: "FAIL",
        message: "Cannot check plugin registration: opencode.json does not exist",
        detail: "Run `micode-beads init` to create opencode.json with the plugin registered.",
        fixable: true,
        component: "plugin",
      };
    }

    const result = parseJsonFile(configPath);
    if (!result.ok) {
      return {
        id: "plugin-registered",
        name: "Plugin Registered",
        status: "FAIL",
        message: "Cannot check plugin registration: opencode.json contains invalid JSON",
        fixable: true,
        component: "plugin",
      };
    }

    const config = result.data as Record<string, unknown>;
    const plugin = config.plugin;

    if (!plugin) {
      return {
        id: "plugin-registered",
        name: "Plugin Registered",
        status: "FAIL",
        message: "No plugin section found in opencode.json",
        detail: 'Add a "plugin" section with "micode-beads" entry to opencode.json.',
        fixable: true,
        component: "plugin",
      };
    }

    const isRegistered = Array.isArray(plugin)
      ? plugin.includes("micode-beads")
      : typeof plugin === "object" && plugin !== null && "micode-beads" in plugin;

    if (!isRegistered) {
      return {
        id: "plugin-registered",
        name: "Plugin Registered",
        status: "FAIL",
        message: "micode-beads is not registered in opencode.json plugin section",
        detail: 'Add "micode-beads" to the plugin section of opencode.json.',
        fixable: true,
        component: "plugin",
      };
    }

    return {
      id: "plugin-registered",
      name: "Plugin Registered",
      status: "PASS",
      message: "micode-beads is registered in opencode.json",
      fixable: true,
      component: "plugin",
    };
  },
};

const micodeJsonValidCheck: DiagnosticCheck = {
  id: "micode-json-valid",
  name: "micode-beads.json",
  component: "config",
  run: async (projectDir: string) => {
    const configPath = join(projectDir, "micode-beads.json");
    if (!existsSync(configPath)) {
      return {
        id: "micode-json-valid",
        name: "micode-beads.json",
        status: "PASS",
        message: "micode-beads.json not present (optional, using defaults)",
        fixable: true,
        component: "config",
      };
    }

    const result = parseJsonFile(configPath);
    if (!result.ok) {
      return {
        id: "micode-json-valid",
        name: "micode-beads.json",
        status: "FAIL",
        message: "micode-beads.json contains invalid JSON",
        detail: result.error,
        fixable: true,
        component: "config",
      };
    }

    if (typeof result.data !== "object" || result.data === null || Array.isArray(result.data)) {
      return {
        id: "micode-json-valid",
        name: "micode-beads.json",
        status: "FAIL",
        message: "micode-beads.json must be a JSON object",
        detail: `Got ${Array.isArray(result.data) ? "array" : typeof result.data}`,
        fixable: true,
        component: "config",
      };
    }

    const data = result.data as Record<string, unknown>;
    const issues: string[] = [];

    if (
      data.agents !== undefined &&
      (typeof data.agents !== "object" || data.agents === null || Array.isArray(data.agents))
    ) {
      issues.push('"agents" must be an object');
    }

    if (
      data.features !== undefined &&
      (typeof data.features !== "object" || data.features === null || Array.isArray(data.features))
    ) {
      issues.push('"features" must be an object');
    }

    if (data.compactionThreshold !== undefined) {
      if (
        typeof data.compactionThreshold !== "number" ||
        data.compactionThreshold < 0 ||
        data.compactionThreshold > 1
      ) {
        issues.push('"compactionThreshold" must be a number between 0 and 1');
      }
    }

    if (
      data.fragments !== undefined &&
      (typeof data.fragments !== "object" || data.fragments === null || Array.isArray(data.fragments))
    ) {
      issues.push('"fragments" must be an object');
    }

    if (data.methodology !== undefined && typeof data.methodology !== "string") {
      issues.push('"methodology" must be a string');
    }

    if (data.researchDirs !== undefined && !Array.isArray(data.researchDirs)) {
      issues.push('"researchDirs" must be an array');
    }

    if (data.afk !== undefined && typeof data.afk !== "boolean") {
      issues.push('"afk" must be a boolean');
    }

    if (issues.length > 0) {
      return {
        id: "micode-json-valid",
        name: "micode-beads.json",
        status: "WARN",
        message: "micode-beads.json has schema issues",
        detail: issues.join("; "),
        fixable: true,
        component: "config",
      };
    }

    return {
      id: "micode-json-valid",
      name: "micode-beads.json",
      status: "PASS",
      message: "micode-beads.json is valid",
      fixable: true,
      component: "config",
    };
  },
};

const thoughtsDirsCheck: DiagnosticCheck = {
  id: "thoughts-dirs",
  name: "thoughts/ Structure",
  component: "config",
  run: async (projectDir: string) => {
    const missing: string[] = [];

    for (const dir of THOUGHTS_DIRS) {
      const fullPath = join(projectDir, dir);
      if (!existsSync(fullPath)) {
        missing.push(dir);
      }
    }

    if (missing.length > 0) {
      return {
        id: "thoughts-dirs",
        name: "thoughts/ Structure",
        status: "FAIL",
        message: `Missing ${missing.length} required thoughts/ ${missing.length === 1 ? "directory" : "directories"}`,
        detail: `Missing: ${missing.join(", ")}`,
        fixable: true,
        component: "config",
      };
    }

    return {
      id: "thoughts-dirs",
      name: "thoughts/ Structure",
      status: "PASS",
      message: "All required thoughts/ directories exist",
      fixable: true,
      component: "config",
    };
  },
};

const mindmodelDirCheck: DiagnosticCheck = {
  id: "mindmodel-dir",
  name: ".mindmodel/ Directory",
  component: "config",
  run: async (projectDir: string) => {
    const mindmodelDir = join(projectDir, ".mindmodel");
    if (!existsSync(mindmodelDir)) {
      return {
        id: "mindmodel-dir",
        name: ".mindmodel/ Directory",
        status: "WARN",
        message: ".mindmodel/ directory not found (optional)",
        detail: "Run `micode-beads init --mindmodel` to scaffold constraint files, or skip if not using constraints.",
        fixable: false,
        component: "config",
      };
    }

    return {
      id: "mindmodel-dir",
      name: ".mindmodel/ Directory",
      status: "PASS",
      message: ".mindmodel/ directory exists",
      fixable: false,
      component: "config",
    };
  },
};

const writePermissionsCheck: DiagnosticCheck = {
  id: "write-permissions",
  name: "Write Permissions",
  component: "cli",
  run: async (projectDir: string) => {
    const dirsToCheck: Array<{ path: string; label: string }> = [{ path: projectDir, label: "project directory" }];

    const thoughtsDir = join(projectDir, "thoughts");
    if (existsSync(thoughtsDir)) {
      dirsToCheck.push({ path: thoughtsDir, label: "thoughts/" });
    }

    const mindmodelDir = join(projectDir, ".mindmodel");
    if (existsSync(mindmodelDir)) {
      dirsToCheck.push({ path: mindmodelDir, label: ".mindmodel/" });
    }

    const noWrite: string[] = [];
    for (const { path, label } of dirsToCheck) {
      if (!hasWriteAccess(path)) {
        noWrite.push(label);
      }
    }

    if (noWrite.length > 0) {
      return {
        id: "write-permissions",
        name: "Write Permissions",
        status: "FAIL",
        message: `No write access to: ${noWrite.join(", ")}`,
        detail: "Check directory ownership and permissions.",
        fixable: false,
        component: "cli",
      };
    }

    return {
      id: "write-permissions",
      name: "Write Permissions",
      status: "PASS",
      message: "Write access confirmed for all relevant directories",
      fixable: false,
      component: "cli",
    };
  },
};

checks.push(
  bunRuntimeCheck,
  opencodeCLICheck,
  gitAvailableCheck,
  pathCorrectCheck,
  opencodeJsonExistsCheck,
  opencodeJsonValidCheck,
  pluginRegisteredCheck,
  micodeJsonValidCheck,
  thoughtsDirsCheck,
  mindmodelDirCheck,
  writePermissionsCheck,
);
