import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

import { commands } from "../../src/cli/index";
import { dispatch, resolveCommand } from "../../src/cli/router";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

describe("command definitions", () => {
  it("should export init and doctor commands", () => {
    const names = commands.map((c) => c.name);
    expect(names).toContain("init");
    expect(names).toContain("doctor");
  });

  it("should define init command with mindmodel flag", () => {
    const init = commands.find((c) => c.name === "init");
    expect(init).toBeDefined();
    expect(init!.flags).toBeDefined();
    const mindmodelFlag = init!.flags!.find((f) => f.name === "mindmodel");
    expect(mindmodelFlag).toBeDefined();
    expect(mindmodelFlag!.type).toBe("boolean");
  });

  it("should define doctor command with fix, json, verbose flags", () => {
    const doctor = commands.find((c) => c.name === "doctor");
    expect(doctor).toBeDefined();
    expect(doctor!.flags).toBeDefined();
    const flagNames = doctor!.flags!.map((f) => f.name);
    expect(flagNames).toContain("fix");
    expect(flagNames).toContain("json");
    expect(flagNames).toContain("verbose");
  });

  it("should resolve init command from argv", () => {
    const result = resolveCommand(commands, ["init"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("init");
  });

  it("should resolve doctor command with flags", () => {
    const result = resolveCommand(commands, ["doctor", "--fix", "--json"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("doctor");
    expect(result!.remainingArgs).toEqual(["--fix", "--json"]);
  });

  it("should dispatch to init handler without errors", async () => {
    const code = await dispatch(commands, ["--version"], {
      programName: "micode-beads",
      version: "0.0.0-test",
      onVersion: () => {},
    });
    expect(code).toBe(0);
  });
});

describe("CLI binary integration", () => {
  it("should output version with --version flag", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "--version"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^micode-beads v\d+\.\d+\.\d+/);
  });

  it("should output help text with --help flag", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: micode-beads");
    expect(stdout).toContain("doctor");
    expect(stdout).toContain("init");
    expect(stdout).toContain("--fix");
    expect(stdout).toContain("--json");
    expect(stdout).toContain("--verbose");
    expect(stdout).toContain("--mindmodel");
  });

  it("should output help text when no command is provided", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: micode-beads");
  });

  it("should exit with code 2 for unknown commands", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "nonexistent"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(2);
    expect(stderr).toContain("[cli]");
    expect(stderr).toContain("Unknown command: nonexistent");
    expect(stderr).toContain("micode-beads --help");
  });

  it("should use attributed error format for unknown commands", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "badcmd"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(2);
    expect(stderr).toContain("[cli] Error:");
    expect(stderr).toContain("Suggestion:");
  });

  it("should pass --json flag through to doctor command", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "doctor", "--json"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    const jsonOutput = JSON.parse(stdout.trim());
    expect(jsonOutput.version).toBeDefined();
    expect(jsonOutput.checks).toBeInstanceOf(Array);
    expect(jsonOutput.overall).toBeDefined();
  });

  it("should show command-specific help with doctor --help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "doctor", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Diagnose");
    expect(stdout).toContain("--fix");
    expect(stdout).toContain("--json");
    expect(stdout).toContain("--verbose");
  });

  it("should show command-specific help with init --help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "init", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Initialize");
    expect(stdout).toContain("--mindmodel");
  });
});
