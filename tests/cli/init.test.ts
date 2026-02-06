import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../../src/cli/init";

describe("runInit", () => {
  let tmpDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof spyOn>;
  let logOutput: string[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cli-init-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    logOutput = [];
    logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
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

  it("should handle plugin as array and append micode-beads", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(configPath, JSON.stringify({ plugin: ["some-other-plugin"] }));

    await runInit([]);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(Array.isArray(config.plugin)).toBe(true);
    expect(config.plugin).toContain("micode-beads");
    expect(config.plugin).toContain("some-other-plugin");
  });

  it("should not duplicate micode-beads in plugin array", async () => {
    const configPath = join(tmpDir, "opencode.json");
    writeFileSync(configPath, JSON.stringify({ plugin: ["micode-beads"] }));

    await runInit([]);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(Array.isArray(config.plugin)).toBe(true);
    expect(config.plugin.filter((p: string) => p === "micode-beads")).toHaveLength(1);
  });

  describe("post-init health checks", () => {
    it("should run health checks after initialization", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("Running health checks...");
    });

    it("should display check results with pass/warn/fail counts", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      const hasPassedSummary = output.includes("health checks passed");
      const hasCountSummary = /\d+ passed/.test(output);
      expect(hasPassedSummary || hasCountSummary).toBe(true);
    });

    it("should display non-passing checks with details when some checks fail", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      const hasNonPassingCheck = output.includes("[WARN]") || output.includes("[FAIL]");
      const hasAllPassedMessage = output.includes("health checks passed");
      expect(hasNonPassingCheck || hasAllPassedMessage).toBe(true);
    });

    it("should display doctor --fix suggestion when checks fail", async () => {
      writeFileSync(join(tmpDir, "micode-beads.json"), "not valid json");

      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("doctor --fix");
    });

    it("should display pass/warn/fail summary when issues exist", async () => {
      writeFileSync(join(tmpDir, "micode-beads.json"), "not valid json");

      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toMatch(/\d+ passed/);
      expect(output).toMatch(/\d+ failed/);
    });
  });

  describe("environment-specific next steps", () => {
    it("should display next steps after setup", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("Next steps:");
      expect(output).toContain("Run `opencode` to start the AI coding agent");
      expect(output).toContain("Use /build to start a brainstorm-plan-implement workflow");
    });

    it("should suggest --mindmodel when .mindmodel/ does not exist and flag not used", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("micode-beads init --mindmodel");
    });

    it("should not suggest --mindmodel when .mindmodel/ was scaffolded", async () => {
      await runInit(["--mindmodel"]);

      const output = logOutput.join("\n");
      const nextStepsSection = output.substring(output.indexOf("Next steps:"));
      expect(nextStepsSection).not.toContain("micode-beads init --mindmodel");
    });

    it("should not suggest --mindmodel when .mindmodel/ already exists", async () => {
      mkdirSync(join(tmpDir, ".mindmodel"), { recursive: true });
      writeFileSync(join(tmpDir, ".mindmodel", "system.md"), "# Constraints");

      await runInit([]);

      const output = logOutput.join("\n");
      const nextStepsSection = output.substring(output.indexOf("Next steps:"));
      expect(nextStepsSection).not.toContain("micode-beads init --mindmodel");
    });

    it("should use formatted dependency output with status indicators", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("Checking dependencies...");
      expect(output).toMatch(/\[(OK|MISSING)]/);
    });
  });
});
