// tests/e2e/cli-init.test.ts
//
// E2E tests for the CLI init command exercising the full initialization
// flow end-to-end. Validates complete directory structure creation,
// config file contents, idempotent re-init behavior, and the mindmodel
// scaffolding flow.

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../../src/cli/init";

describe("E2E: CLI Init", () => {
  let tmpDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;
  let logOutput: string[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "e2e-cli-init-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    logOutput = [];
    logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    });
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe("full project setup from empty directory", () => {
    it("should create complete project structure with all required directories and config files", async () => {
      await runInit([]);

      expect(existsSync(join(tmpDir, "opencode.json"))).toBe(true);

      expect(existsSync(join(tmpDir, "thoughts", "ledgers"))).toBe(true);
      expect(existsSync(join(tmpDir, "thoughts", "shared", "plans"))).toBe(true);
      expect(existsSync(join(tmpDir, "thoughts", "shared", "designs"))).toBe(true);
      expect(existsSync(join(tmpDir, "thoughts", "brainstorms"))).toBe(true);

      const config = JSON.parse(readFileSync(join(tmpDir, "opencode.json"), "utf-8"));
      expect(config.plugin).toBeDefined();
      expect(Array.isArray(config.plugin)).toBe(true);
      expect(config.plugin).toContain("micode-beads");
    });

    it("should produce structured console output covering all initialization phases", async () => {
      await runInit([]);

      const output = logOutput.join("\n");

      expect(output).toContain("micode-beads init");
      expect(output).toContain("Checking dependencies...");
      expect(output).toContain("Configuring opencode.json...");
      expect(output).toContain("Creating thoughts/ directory structure...");
      expect(output).toContain("Running health checks...");
      expect(output).toContain("Setup complete");
      expect(output).toContain("Next steps:");
    });

    it("should report dependency status with OK or MISSING indicators", async () => {
      await runInit([]);

      const output = logOutput.join("\n");

      expect(output).toMatch(/\[OK\]\s+bun/);
      expect(output).toMatch(/\[(OK|MISSING)\]\s+opencode/);
      expect(output).toMatch(/\[(OK|MISSING)\]\s+git/);
    });

    it("should display created directory paths in output", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("thoughts/ledgers/");
    });
  });

  describe("idempotent re-init", () => {
    it("should produce identical filesystem state when run twice on the same directory", async () => {
      await runInit([]);

      const configAfterFirst = readFileSync(join(tmpDir, "opencode.json"), "utf-8");
      const dirsAfterFirst = {
        ledgers: existsSync(join(tmpDir, "thoughts", "ledgers")),
        plans: existsSync(join(tmpDir, "thoughts", "shared", "plans")),
        designs: existsSync(join(tmpDir, "thoughts", "shared", "designs")),
        brainstorms: existsSync(join(tmpDir, "thoughts", "brainstorms")),
      };

      logOutput = [];
      await runInit([]);

      const configAfterSecond = readFileSync(join(tmpDir, "opencode.json"), "utf-8");
      const dirsAfterSecond = {
        ledgers: existsSync(join(tmpDir, "thoughts", "ledgers")),
        plans: existsSync(join(tmpDir, "thoughts", "shared", "plans")),
        designs: existsSync(join(tmpDir, "thoughts", "shared", "designs")),
        brainstorms: existsSync(join(tmpDir, "thoughts", "brainstorms")),
      };

      expect(configAfterSecond).toBe(configAfterFirst);
      expect(dirsAfterSecond).toEqual(dirsAfterFirst);
    });

    it("should not duplicate the micode-beads entry in the plugin array on re-init", async () => {
      await runInit([]);
      await runInit([]);

      const config = JSON.parse(readFileSync(join(tmpDir, "opencode.json"), "utf-8"));
      const micodeEntries = config.plugin.filter((p: string) => p === "micode-beads");
      expect(micodeEntries).toHaveLength(1);
    });

    it("should report already-configured status on re-init", async () => {
      await runInit([]);

      logOutput = [];
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("already configured");
    });

    it("should report existing directories on re-init", async () => {
      await runInit([]);

      logOutput = [];
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("All directories already exist");
    });
  });

  describe("init with --mindmodel flag", () => {
    it("should scaffold the complete .mindmodel directory with system.md template", async () => {
      await runInit(["--mindmodel"]);

      expect(existsSync(join(tmpDir, ".mindmodel"))).toBe(true);
      expect(existsSync(join(tmpDir, ".mindmodel", "system.md"))).toBe(true);

      const systemContent = readFileSync(join(tmpDir, ".mindmodel", "system.md"), "utf-8");
      expect(systemContent).toContain("Project Constraints");
    });

    it("should not overwrite existing .mindmodel directory", async () => {
      mkdirSync(join(tmpDir, ".mindmodel"), { recursive: true });
      writeFileSync(join(tmpDir, ".mindmodel", "system.md"), "# My Custom Constraints\nDo not change this.");

      await runInit(["--mindmodel"]);

      const content = readFileSync(join(tmpDir, ".mindmodel", "system.md"), "utf-8");
      expect(content).toBe("# My Custom Constraints\nDo not change this.");
    });

    it("should create both .mindmodel and thoughts directories in a single init call", async () => {
      await runInit(["--mindmodel"]);

      expect(existsSync(join(tmpDir, ".mindmodel"))).toBe(true);
      expect(existsSync(join(tmpDir, "thoughts", "ledgers"))).toBe(true);
      expect(existsSync(join(tmpDir, "thoughts", "shared", "plans"))).toBe(true);
    });
  });

  describe("init with pre-existing opencode.json", () => {
    it("should preserve existing config fields when adding micode-beads plugin", async () => {
      const existingConfig = {
        model: "anthropic/claude-opus-4.6",
        provider: {
          anthropic: { apiKey: "sk-test" },
        },
        theme: "dark",
      };
      writeFileSync(join(tmpDir, "opencode.json"), JSON.stringify(existingConfig, null, 2));

      await runInit([]);

      const config = JSON.parse(readFileSync(join(tmpDir, "opencode.json"), "utf-8"));
      expect(config.model).toBe("anthropic/claude-opus-4.6");
      expect(config.provider).toBeDefined();
      expect(config.provider.anthropic).toBeDefined();
      expect(config.theme).toBe("dark");
      expect(config.plugin).toContain("micode-beads");
    });

    it("should add micode-beads to an existing plugin array without removing others", async () => {
      const existingConfig = {
        plugin: ["other-plugin-a", "other-plugin-b"],
      };
      writeFileSync(join(tmpDir, "opencode.json"), JSON.stringify(existingConfig));

      await runInit([]);

      const config = JSON.parse(readFileSync(join(tmpDir, "opencode.json"), "utf-8"));
      expect(config.plugin).toContain("other-plugin-a");
      expect(config.plugin).toContain("other-plugin-b");
      expect(config.plugin).toContain("micode-beads");
      expect(config.plugin).toHaveLength(3);
    });

    it("should convert plugin object format to array format when adding micode-beads", async () => {
      const existingConfig = {
        plugin: { "some-plugin": { setting: true } },
      };
      writeFileSync(join(tmpDir, "opencode.json"), JSON.stringify(existingConfig));

      await runInit([]);

      const config = JSON.parse(readFileSync(join(tmpDir, "opencode.json"), "utf-8"));
      expect(Array.isArray(config.plugin)).toBe(true);
      expect(config.plugin).toContain("some-plugin");
      expect(config.plugin).toContain("micode-beads");
    });
  });

  describe("health checks integration", () => {
    it("should run health checks and show summary after all setup steps", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      const healthCheckIndex = output.indexOf("Running health checks...");
      const setupCompleteIndex = output.indexOf("Setup complete");

      expect(healthCheckIndex).toBeGreaterThan(-1);
      expect(setupCompleteIndex).toBeGreaterThan(healthCheckIndex);
    });

    it("should suggest next steps relevant to the environment state", async () => {
      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("Run `opencode` to start the AI coding agent");
      expect(output).toContain("Use /build to start a brainstorm-plan-implement workflow");
    });

    it("should suggest doctor --fix when health checks find failures", async () => {
      writeFileSync(join(tmpDir, "micode-beads.json"), "{ invalid json }");

      await runInit([]);

      const output = logOutput.join("\n");
      expect(output).toContain("doctor --fix");
    });
  });
});
