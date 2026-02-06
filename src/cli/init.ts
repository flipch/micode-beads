import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { which } from "bun";

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

export async function runInit(args: string[]): Promise<void> {
  const scaffoldMindmodel = args.includes("--mindmodel");
  const projectDir = resolve(process.cwd());

  console.log("\nmicode-beads init\n");
  console.log(`Project directory: ${projectDir}\n`);

  console.log("Checking dependencies...");
  const depResults = checkDependencies();
  let hasMissing = false;

  for (const dep of depResults) {
    if (dep.available) {
      console.log(`  ${dep.name}: found`);
    } else {
      console.log(`  ${dep.name}: not found`);
      hasMissing = true;
    }
  }

  if (hasMissing) {
    console.log("\nWarning: Some dependencies are missing. micode-beads may not work correctly.");
    console.log("Install missing dependencies and run init again.\n");
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

  console.log("\n--- Setup complete ---\n");
  console.log("Next steps:");
  console.log("  1. Run `opencode` to start the AI coding agent");
  console.log("  2. Use /build to start a brainstorm-plan-implement workflow");

  if (!scaffoldMindmodel) {
    console.log("  3. Run `micode-beads init --mindmodel` to scaffold .mindmodel/ constraints (optional)");
  }

  console.log("");
}
