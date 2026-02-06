import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { which } from "bun";

import type { CheckResult } from "./doctor-checks";
import { runAllChecks } from "./doctor-checks";
import { detectOutputOptions, formatCheckResult } from "./output";

interface DependencyResult {
  name: string;
  available: boolean;
}

interface ConfigResult {
  created: boolean;
  updated: boolean;
  path: string;
}

interface OpencodeJson {
  plugin?: Record<string, unknown> | string[];
  [key: string]: unknown;
}

const REQUIRED_DEPS = ["bun", "opencode", "git"] as const;

const THOUGHTS_DIRS = [
  "thoughts/ledgers",
  "thoughts/shared/plans",
  "thoughts/shared/designs",
  "thoughts/brainstorms",
] as const;

function checkDependency(name: string): DependencyResult {
  const path = which(name);
  return { name, available: path !== null };
}

function checkDependencies(): DependencyResult[] {
  return REQUIRED_DEPS.map(checkDependency);
}

function loadExistingConfig(configPath: string): OpencodeJson | null {
  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as OpencodeJson;
  } catch {
    return null;
  }
}

function pluginContainsMicodeBeads(plugin: unknown): boolean {
  if (Array.isArray(plugin)) {
    return plugin.includes("micode-beads");
  }
  if (typeof plugin === "object" && plugin !== null) {
    return "micode-beads" in plugin;
  }
  return false;
}

function createOrUpdateOpencodeJson(projectDir: string): ConfigResult {
  const configPath = join(projectDir, "opencode.json");
  const existing = loadExistingConfig(configPath);

  if (existing) {
    if (pluginContainsMicodeBeads(existing.plugin)) {
      return { created: false, updated: false, path: configPath };
    }

    let updatedPlugin: Record<string, unknown> | string[];
    if (Array.isArray(existing.plugin)) {
      updatedPlugin = [...existing.plugin, "micode-beads"];
    } else {
      updatedPlugin = {
        ...(typeof existing.plugin === "object" && existing.plugin !== null ? existing.plugin : {}),
        "micode-beads": {},
      };
    }

    const updated: OpencodeJson = { ...existing, plugin: updatedPlugin };
    writeFileSync(configPath, `${JSON.stringify(updated, null, 2)}\n`);
    return { created: false, updated: true, path: configPath };
  }

  const newConfig: OpencodeJson = {
    plugin: {
      "micode-beads": {},
    },
  };
  writeFileSync(configPath, `${JSON.stringify(newConfig, null, 2)}\n`);
  return { created: true, updated: false, path: configPath };
}

function scaffoldMindmodelDir(projectDir: string): boolean {
  const mindmodelDir = join(projectDir, ".mindmodel");
  if (existsSync(mindmodelDir)) {
    return false;
  }

  mkdirSync(mindmodelDir, { recursive: true });
  writeFileSync(
    join(mindmodelDir, "system.md"),
    "# Project Constraints\n\nAdd project-specific coding constraints here.\n",
  );
  return true;
}

function createThoughtsDirs(projectDir: string): string[] {
  const created: string[] = [];

  for (const dir of THOUGHTS_DIRS) {
    const fullPath = join(projectDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      created.push(dir);
    }
  }

  return created;
}

function colorize(text: string, code: string, color: boolean): string {
  return color ? `${code}${text}\x1b[0m` : text;
}

function buildNextSteps(checkResults: CheckResult[], scaffoldedMindmodel: boolean): string[] {
  const steps: string[] = [];

  const opencodeCheck = checkResults.find((r) => r.id === "opencode-cli");
  if (opencodeCheck && opencodeCheck.status !== "PASS") {
    steps.push("Install OpenCode: https://opencode.ai/docs/getting-started");
  }

  const gitCheck = checkResults.find((r) => r.id === "git-available");
  if (gitCheck && gitCheck.status !== "PASS") {
    steps.push("Install git: https://git-scm.com/downloads");
  }

  steps.push("Run `opencode` to start the AI coding agent");
  steps.push("Use /build to start a brainstorm-plan-implement workflow");

  if (!scaffoldedMindmodel) {
    const mindmodelCheck = checkResults.find((r) => r.id === "mindmodel-dir");
    if (mindmodelCheck && mindmodelCheck.status !== "PASS") {
      steps.push("Run `micode-beads init --mindmodel` to scaffold .mindmodel/ constraints (optional)");
    }
  }

  return steps;
}

export async function runInit(args: string[]): Promise<void> {
  const scaffoldMindmodel = args.includes("--mindmodel");
  const projectDir = resolve(process.cwd());
  const outputOptions = detectOutputOptions({});

  console.log("\nmicode-beads init\n");
  console.log(`Project directory: ${projectDir}\n`);

  console.log("Checking dependencies...");
  const depResults = checkDependencies();
  let hasMissing = false;

  for (const dep of depResults) {
    if (dep.available) {
      const indicator = colorize("OK", "\x1b[32m", outputOptions.color);
      console.log(`  [${indicator}] ${dep.name}`);
    } else {
      const indicator = colorize("MISSING", "\x1b[31m", outputOptions.color);
      console.log(`  [${indicator}] ${dep.name}`);
      hasMissing = true;
    }
  }

  if (hasMissing) {
    const msg = "Some dependencies are missing. micode-beads may not work correctly.";
    console.log(`\n${colorize(msg, "\x1b[33m", outputOptions.color)}`);
  }

  console.log("\nConfiguring opencode.json...");
  const configResult = createOrUpdateOpencodeJson(projectDir);

  if (configResult.created) {
    console.log(`  Created ${configResult.path}`);
  } else if (configResult.updated) {
    console.log(`  Updated ${configResult.path} (added micode-beads plugin)`);
  } else {
    console.log(`  ${configResult.path} already configured`);
  }

  if (scaffoldMindmodel) {
    console.log("\nScaffolding .mindmodel/ directory...");
    const created = scaffoldMindmodelDir(projectDir);

    if (created) {
      console.log("  Created .mindmodel/ with system.md template");
    } else {
      console.log("  .mindmodel/ already exists, skipping");
    }
  }

  console.log("\nCreating thoughts/ directory structure...");
  const createdDirs = createThoughtsDirs(projectDir);

  if (createdDirs.length > 0) {
    for (const dir of createdDirs) {
      console.log(`  Created ${dir}/`);
    }
  } else {
    console.log("  All directories already exist");
  }

  console.log("\nRunning health checks...");
  const checkResults = await runAllChecks(projectDir);

  const failures = checkResults.filter((r) => r.status === "FAIL");
  const warnings = checkResults.filter((r) => r.status === "WARN");
  const passes = checkResults.filter((r) => r.status === "PASS");

  if (failures.length === 0 && warnings.length === 0) {
    const msg = `All ${checkResults.length} health checks passed.`;
    console.log(`  ${colorize(msg, "\x1b[32m", outputOptions.color)}`);
  } else {
    for (const result of checkResults) {
      if (result.status !== "PASS") {
        const verboseOptions = { ...outputOptions, verbose: true };
        console.log(`  ${formatCheckResult(result, verboseOptions)}`);
      }
    }
    console.log(
      `\n  ${passes.length} passed, ${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}, ${failures.length} failed`,
    );
  }

  console.log("\n--- Setup complete ---\n");

  const nextSteps = buildNextSteps(checkResults, scaffoldMindmodel);
  console.log("Next steps:");
  for (let i = 0; i < nextSteps.length; i++) {
    console.log(`  ${i + 1}. ${nextSteps[i]}`);
  }

  if (failures.length > 0) {
    const msg = "\nSome health checks failed. Run `micode-beads doctor --fix` to attempt auto-repair.";
    console.log(colorize(msg, "\x1b[33m", outputOptions.color));
  }

  console.log("");
}
