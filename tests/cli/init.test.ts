import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../../src/cli/init";

describe("runInit", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cli-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create opencode.json with micode-beads plugin when no config exists", async () => {
    await runInit([]);

    const configPath = join(tmpDir, "opencode.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.plugin).toBeDefined();
    expect(config.plugin["micode-beads"]).toBeDefined();
  });

  it("should update existing opencode.json to include micode-beads plugin", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        model: "openai/gpt-4o",
        plugin: {
          "some-other-plugin": {},
        },
      }),
    );

    await runInit([]);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.model).toBe("openai/gpt-4o");
    expect(config.plugin["some-other-plugin"]).toBeDefined();
    expect(config.plugin["micode-beads"]).toBeDefined();
  });

  it("should not modify opencode.json when micode-beads is already configured (idempotent)", async () => {
    const configPath = join(tmpDir, "opencode.json");
    const original = {
      plugin: {
        "micode-beads": { custom: "setting" },
      },
    };
    writeFileSync(configPath, JSON.stringify(original, null, 2));

    await runInit([]);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.plugin["micode-beads"]).toEqual({ custom: "setting" });
  });

  it("should create thoughts/ directory structure", async () => {
    await runInit([]);

    expect(existsSync(join(tmpDir, "thoughts", "ledgers"))).toBe(true);
    expect(existsSync(join(tmpDir, "thoughts", "shared", "plans"))).toBe(true);
    expect(existsSync(join(tmpDir, "thoughts", "shared", "designs"))).toBe(true);
    expect(existsSync(join(tmpDir, "thoughts", "brainstorms"))).toBe(true);
  });

  it("should scaffold .mindmodel/ when --mindmodel flag is present", async () => {
    await runInit(["--mindmodel"]);

    expect(existsSync(join(tmpDir, ".mindmodel"))).toBe(true);
    expect(existsSync(join(tmpDir, ".mindmodel", "system.md"))).toBe(true);

    const content = readFileSync(join(tmpDir, ".mindmodel", "system.md"), "utf-8");
    expect(content).toContain("Project Constraints");
  });

  it("should not scaffold .mindmodel/ without --mindmodel flag", async () => {
    await runInit([]);

    expect(existsSync(join(tmpDir, ".mindmodel"))).toBe(false);
  });

  it("should not overwrite existing .mindmodel/ directory", async () => {
    const mindmodelDir = join(tmpDir, ".mindmodel");
    mkdirSync(mindmodelDir, { recursive: true });
    writeFileSync(join(mindmodelDir, "system.md"), "# Custom constraints");

    await runInit(["--mindmodel"]);

    const content = readFileSync(join(mindmodelDir, "system.md"), "utf-8");
    expect(content).toBe("# Custom constraints");
  });

  it("should be idempotent - running twice produces same result", async () => {
    await runInit([]);
    await runInit([]);

    const configPath = join(tmpDir, "opencode.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.plugin["micode-beads"]).toBeDefined();

    expect(existsSync(join(tmpDir, "thoughts", "ledgers"))).toBe(true);
  });

  it("should not crash when thoughts/ directories already exist", async () => {
    mkdirSync(join(tmpDir, "thoughts", "ledgers"), { recursive: true });

    await runInit([]);

    expect(existsSync(join(tmpDir, "thoughts", "ledgers"))).toBe(true);
  });
});
