import { describe, expect, it } from "bun:test";

import { parseArgs } from "../../src/cli/index";

describe("parseArgs", () => {
  it("should parse a command with no flags", () => {
    const result = parseArgs(["init"]);
    expect(result.command).toBe("init");
    expect(result.flags.help).toBe(false);
    expect(result.flags.version).toBe(false);
    expect(result.flags.fix).toBe(false);
    expect(result.flags.json).toBe(false);
    expect(result.flags.verbose).toBe(false);
    expect(result.flags.mindmodel).toBe(false);
    expect(result.positional).toEqual([]);
  });

  it("should parse doctor command with --fix flag", () => {
    const result = parseArgs(["doctor", "--fix"]);
    expect(result.command).toBe("doctor");
    expect(result.flags.fix).toBe(true);
  });

  it("should parse doctor command with --json flag", () => {
    const result = parseArgs(["doctor", "--json"]);
    expect(result.command).toBe("doctor");
    expect(result.flags.json).toBe(true);
  });

  it("should parse doctor command with --verbose flag", () => {
    const result = parseArgs(["doctor", "--verbose"]);
    expect(result.command).toBe("doctor");
    expect(result.flags.verbose).toBe(true);
  });

  it("should parse doctor command with multiple flags", () => {
    const result = parseArgs(["doctor", "--fix", "--json", "--verbose"]);
    expect(result.command).toBe("doctor");
    expect(result.flags.fix).toBe(true);
    expect(result.flags.json).toBe(true);
    expect(result.flags.verbose).toBe(true);
  });

  it("should parse init command with --mindmodel flag", () => {
    const result = parseArgs(["init", "--mindmodel"]);
    expect(result.command).toBe("init");
    expect(result.flags.mindmodel).toBe(true);
  });

  it("should parse --help flag with short alias", () => {
    const result = parseArgs(["-h"]);
    expect(result.command).toBeUndefined();
    expect(result.flags.help).toBe(true);
  });

  it("should parse --help long form", () => {
    const result = parseArgs(["--help"]);
    expect(result.command).toBeUndefined();
    expect(result.flags.help).toBe(true);
  });

  it("should parse --version flag with short alias", () => {
    const result = parseArgs(["-v"]);
    expect(result.command).toBeUndefined();
    expect(result.flags.version).toBe(true);
  });

  it("should parse --version long form", () => {
    const result = parseArgs(["--version"]);
    expect(result.command).toBeUndefined();
    expect(result.flags.version).toBe(true);
  });

  it("should return undefined command when no arguments", () => {
    const result = parseArgs([]);
    expect(result.command).toBeUndefined();
    expect(result.positional).toEqual([]);
  });

  it("should capture unknown flags as positional arguments", () => {
    const result = parseArgs(["init", "--unknown-flag"]);
    expect(result.command).toBe("init");
    expect(result.positional).toEqual(["--unknown-flag"]);
  });

  it("should capture extra non-flag arguments as positional", () => {
    const result = parseArgs(["init", "extra-arg"]);
    expect(result.command).toBe("init");
    expect(result.positional).toEqual(["extra-arg"]);
  });

  it("should handle --help alongside a command", () => {
    const result = parseArgs(["doctor", "--help"]);
    expect(result.command).toBe("doctor");
    expect(result.flags.help).toBe(true);
  });

  it("should handle flags before the command", () => {
    const result = parseArgs(["--json", "doctor"]);
    expect(result.flags.json).toBe(true);
    expect(result.command).toBe("doctor");
  });

  it("should not set command for flags-only input", () => {
    const result = parseArgs(["--fix", "--verbose"]);
    expect(result.command).toBeUndefined();
    expect(result.flags.fix).toBe(true);
    expect(result.flags.verbose).toBe(true);
  });

  it("should parse unknown command as command string", () => {
    const result = parseArgs(["foobar"]);
    expect(result.command).toBe("foobar");
    expect(result.positional).toEqual([]);
  });

  it("should handle all flags combined with a command", () => {
    const result = parseArgs(["doctor", "--fix", "--json", "--verbose", "--help", "--version"]);
    expect(result.command).toBe("doctor");
    expect(result.flags.fix).toBe(true);
    expect(result.flags.json).toBe(true);
    expect(result.flags.verbose).toBe(true);
    expect(result.flags.help).toBe(true);
    expect(result.flags.version).toBe(true);
  });

  it("should handle init with no extra flags", () => {
    const result = parseArgs(["init"]);
    expect(result.command).toBe("init");
    expect(result.flags.mindmodel).toBe(false);
  });
});

describe("CLI binary integration", () => {
  it("should output version with --version flag", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "--version"], {
      cwd: "/Users/felipeh/.micode-beads",
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
      cwd: "/Users/felipeh/.micode-beads",
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
      cwd: "/Users/felipeh/.micode-beads",
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
      cwd: "/Users/felipeh/.micode-beads",
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
      cwd: "/Users/felipeh/.micode-beads",
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
      cwd: "/Users/felipeh/.micode-beads",
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
});
