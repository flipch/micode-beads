import { describe, expect, it } from "bun:test";

import {
  dispatch,
  EXIT_ERROR,
  EXIT_SUCCESS,
  EXIT_USAGE,
  EXIT_VALIDATION,
  EXIT_WORKFLOW,
  formatCommandHelp,
  formatRootHelp,
  parseCommandArgs,
  RouterError,
  resolveCommand,
  type SubcommandDef,
} from "../../src/cli/router";

function makeCommand(overrides: Partial<SubcommandDef> = {}): SubcommandDef {
  return {
    name: "test",
    description: "Test command",
    usage: "prog test",
    handler: async () => 0,
    ...overrides,
  };
}

describe("exit code constants", () => {
  it("should define expected exit codes", () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_ERROR).toBe(1);
    expect(EXIT_USAGE).toBe(2);
    expect(EXIT_WORKFLOW).toBe(3);
    expect(EXIT_VALIDATION).toBe(4);
  });
});

describe("resolveCommand", () => {
  const commands = [
    makeCommand({ name: "init" }),
    makeCommand({ name: "doctor" }),
    makeCommand({
      name: "workflow",
      subcommands: [
        makeCommand({ name: "status" }),
        makeCommand({ name: "list" }),
        makeCommand({
          name: "deep",
          subcommands: [makeCommand({ name: "nested" })],
        }),
      ],
    }),
  ];

  it("should resolve a top-level command", () => {
    const result = resolveCommand(commands, ["init"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("init");
    expect(result!.commandPath).toEqual(["init"]);
    expect(result!.remainingArgs).toEqual([]);
  });

  it("should resolve a nested subcommand", () => {
    const result = resolveCommand(commands, ["workflow", "status"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("status");
    expect(result!.commandPath).toEqual(["workflow", "status"]);
    expect(result!.remainingArgs).toEqual([]);
  });

  it("should pass remaining args through", () => {
    const result = resolveCommand(commands, ["doctor", "--fix", "--json"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("doctor");
    expect(result!.remainingArgs).toEqual(["--fix", "--json"]);
  });

  it("should pass remaining args through for nested subcommands", () => {
    const result = resolveCommand(commands, ["workflow", "status", "--json", "my-feature"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("status");
    expect(result!.commandPath).toEqual(["workflow", "status"]);
    expect(result!.remainingArgs).toEqual(["--json", "my-feature"]);
  });

  it("should return null for empty argv", () => {
    expect(resolveCommand(commands, [])).toBeNull();
  });

  it("should return null for unknown command", () => {
    expect(resolveCommand(commands, ["foobar"])).toBeNull();
  });

  it("should return null when only flags are provided", () => {
    expect(resolveCommand(commands, ["--help"])).toBeNull();
  });

  it("should resolve parent command when subcommand is unknown", () => {
    const result = resolveCommand(commands, ["workflow", "unknown"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("workflow");
    expect(result!.commandPath).toEqual(["workflow"]);
    expect(result!.remainingArgs).toEqual(["unknown"]);
  });

  it("should resolve deeply nested subcommands", () => {
    const result = resolveCommand(commands, ["workflow", "deep", "nested"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("nested");
    expect(result!.commandPath).toEqual(["workflow", "deep", "nested"]);
  });

  it("should handle flags before the command name", () => {
    const result = resolveCommand(commands, ["--json", "doctor"]);
    expect(result).not.toBeNull();
    expect(result!.command.name).toBe("doctor");
    expect(result!.remainingArgs).toEqual(["--json"]);
  });
});

describe("parseCommandArgs", () => {
  it("should parse boolean flags", () => {
    const cmd = makeCommand({
      flags: [
        { name: "fix", description: "Fix", type: "boolean" },
        { name: "json", description: "JSON", type: "boolean" },
      ],
    });
    const result = parseCommandArgs(cmd, ["--fix"]);
    expect(result.flags.fix).toBe(true);
    expect(result.flags.json).toBe(false);
  });

  it("should parse short flag aliases", () => {
    const cmd = makeCommand({
      flags: [{ name: "json", short: "j", description: "JSON", type: "boolean" }],
    });
    const result = parseCommandArgs(cmd, ["-j"]);
    expect(result.flags.json).toBe(true);
  });

  it("should parse string flags with space-separated value", () => {
    const cmd = makeCommand({
      flags: [{ name: "from", description: "From stage", type: "string" }],
    });
    const result = parseCommandArgs(cmd, ["--from", "implement"]);
    expect(result.flags.from).toBe("implement");
  });

  it("should parse string flags with equals-sign value", () => {
    const cmd = makeCommand({
      flags: [{ name: "from", description: "From stage", type: "string" }],
    });
    const result = parseCommandArgs(cmd, ["--from=implement"]);
    expect(result.flags.from).toBe("implement");
  });

  it("should parse number flags", () => {
    const cmd = makeCommand({
      flags: [{ name: "count", description: "Count", type: "number" }],
    });
    const result = parseCommandArgs(cmd, ["--count", "42"]);
    expect(result.flags.count).toBe(42);
  });

  it("should parse number flags with equals-sign value", () => {
    const cmd = makeCommand({
      flags: [{ name: "count", description: "Count", type: "number" }],
    });
    const result = parseCommandArgs(cmd, ["--count=42"]);
    expect(result.flags.count).toBe(42);
  });

  it("should collect positional arguments", () => {
    const cmd = makeCommand({
      flags: [{ name: "json", description: "JSON", type: "boolean" }],
      positional: [{ name: "feature-id", description: "Feature ID", required: false }],
    });
    const result = parseCommandArgs(cmd, ["--json", "my-feature"]);
    expect(result.flags.json).toBe(true);
    expect(result.positional).toEqual(["my-feature"]);
  });

  it("should apply default values for flags", () => {
    const cmd = makeCommand({
      flags: [{ name: "format", description: "Format", type: "string", default: "table" }],
    });
    const result = parseCommandArgs(cmd, []);
    expect(result.flags.format).toBe("table");
  });

  it("should override default values when flag is provided", () => {
    const cmd = makeCommand({
      flags: [{ name: "format", description: "Format", type: "string", default: "table" }],
    });
    const result = parseCommandArgs(cmd, ["--format", "json"]);
    expect(result.flags.format).toBe("json");
  });

  it("should handle -- separator to stop flag parsing", () => {
    const cmd = makeCommand({
      flags: [{ name: "json", description: "JSON", type: "boolean" }],
    });
    const result = parseCommandArgs(cmd, ["--json", "--", "--not-a-flag"]);
    expect(result.flags.json).toBe(true);
    expect(result.positional).toEqual(["--not-a-flag"]);
  });

  it("should throw RouterError for unknown long flags", () => {
    const cmd = makeCommand({
      flags: [{ name: "json", description: "JSON", type: "boolean" }],
    });
    expect(() => parseCommandArgs(cmd, ["--unknown"])).toThrow(RouterError);
    try {
      parseCommandArgs(cmd, ["--unknown"]);
    } catch (e) {
      expect((e as RouterError).exitCode).toBe(EXIT_USAGE);
      expect((e as RouterError).message).toContain("Unknown flag: --unknown");
      expect((e as RouterError).message).toContain("--json");
    }
  });

  it("should throw RouterError for unknown short flags", () => {
    const cmd = makeCommand({
      flags: [{ name: "json", short: "j", description: "JSON", type: "boolean" }],
    });
    expect(() => parseCommandArgs(cmd, ["-x"])).toThrow(RouterError);
    try {
      parseCommandArgs(cmd, ["-x"]);
    } catch (e) {
      expect((e as RouterError).exitCode).toBe(EXIT_USAGE);
      expect((e as RouterError).message).toContain("Unknown flag: -x");
    }
  });

  it("should throw RouterError for invalid number values", () => {
    const cmd = makeCommand({
      flags: [{ name: "count", description: "Count", type: "number" }],
    });
    expect(() => parseCommandArgs(cmd, ["--count", "abc"])).toThrow(RouterError);
    try {
      parseCommandArgs(cmd, ["--count", "abc"]);
    } catch (e) {
      expect((e as RouterError).exitCode).toBe(EXIT_USAGE);
      expect((e as RouterError).message).toContain("expected a number");
      expect((e as RouterError).message).toContain('"abc"');
    }
  });

  it("should throw RouterError when string flag is missing its value", () => {
    const cmd = makeCommand({
      flags: [{ name: "from", description: "From stage", type: "string" }],
    });
    expect(() => parseCommandArgs(cmd, ["--from"])).toThrow(RouterError);
    try {
      parseCommandArgs(cmd, ["--from"]);
    } catch (e) {
      expect((e as RouterError).exitCode).toBe(EXIT_USAGE);
      expect((e as RouterError).message).toContain("requires a value");
    }
  });

  it("should throw RouterError when required positional is missing", () => {
    const cmd = makeCommand({
      positional: [{ name: "feature-id", description: "Feature ID", required: true }],
    });
    expect(() => parseCommandArgs(cmd, [])).toThrow(RouterError);
    try {
      parseCommandArgs(cmd, []);
    } catch (e) {
      expect((e as RouterError).exitCode).toBe(EXIT_USAGE);
      expect((e as RouterError).message).toContain("<feature-id>");
    }
  });

  it("should not throw when optional positional is missing", () => {
    const cmd = makeCommand({
      positional: [{ name: "feature-id", description: "Feature ID", required: false }],
    });
    const result = parseCommandArgs(cmd, []);
    expect(result.positional).toEqual([]);
  });

  it("should handle mixed flags and positionals", () => {
    const cmd = makeCommand({
      flags: [
        { name: "json", description: "JSON", type: "boolean" },
        { name: "from", description: "From stage", type: "string" },
      ],
      positional: [{ name: "feature-id", description: "Feature ID", required: true }],
    });
    const result = parseCommandArgs(cmd, ["my-feature", "--json", "--from", "plan"]);
    expect(result.flags.json).toBe(true);
    expect(result.flags.from).toBe("plan");
    expect(result.positional).toEqual(["my-feature"]);
  });

  it("should handle command with no flag definitions", () => {
    const cmd = makeCommand();
    const result = parseCommandArgs(cmd, ["arg1", "arg2"]);
    expect(result.positional).toEqual(["arg1", "arg2"]);
  });

  it("should parse short flags for string type", () => {
    const cmd = makeCommand({
      flags: [{ name: "from", short: "f", description: "From stage", type: "string" }],
    });
    const result = parseCommandArgs(cmd, ["-f", "implement"]);
    expect(result.flags.from).toBe("implement");
  });
});

describe("formatCommandHelp", () => {
  it("should include usage, description, and flags", () => {
    const cmd = makeCommand({
      name: "doctor",
      description: "Diagnose installation health",
      usage: "micode-beads doctor [--fix]",
      flags: [
        { name: "fix", description: "Attempt auto-fix", type: "boolean" },
        { name: "json", description: "Output as JSON", type: "boolean" },
      ],
    });
    const output = formatCommandHelp(cmd, ["doctor"], "micode-beads");
    expect(output).toContain("Usage: micode-beads doctor [--fix]");
    expect(output).toContain("Diagnose installation health");
    expect(output).toContain("--fix");
    expect(output).toContain("Attempt auto-fix");
    expect(output).toContain("--json");
    expect(output).toContain("--help");
  });

  it("should include subcommands when present", () => {
    const cmd = makeCommand({
      name: "workflow",
      description: "Workflow management",
      usage: "micode-beads workflow <command>",
      subcommands: [
        makeCommand({ name: "status", description: "Show workflow status" }),
        makeCommand({ name: "list", description: "List workflows" }),
      ],
    });
    const output = formatCommandHelp(cmd, ["workflow"], "micode-beads");
    expect(output).toContain("Commands:");
    expect(output).toContain("status");
    expect(output).toContain("Show workflow status");
    expect(output).toContain("list");
    expect(output).toContain("List workflows");
  });

  it("should include positional arguments", () => {
    const cmd = makeCommand({
      name: "status",
      description: "Show status",
      usage: "micode-beads workflow status <feature-id>",
      positional: [{ name: "feature-id", description: "Feature identifier", required: true }],
    });
    const output = formatCommandHelp(cmd, ["workflow", "status"], "micode-beads");
    expect(output).toContain("Arguments:");
    expect(output).toContain("<feature-id>");
    expect(output).toContain("Feature identifier");
  });

  it("should show optional positionals with brackets", () => {
    const cmd = makeCommand({
      positional: [{ name: "query", description: "Search query", required: false }],
    });
    const output = formatCommandHelp(cmd, ["search"], "prog");
    expect(output).toContain("[query]");
  });

  it("should show short flag aliases", () => {
    const cmd = makeCommand({
      flags: [{ name: "json", short: "j", description: "JSON output", type: "boolean" }],
    });
    const output = formatCommandHelp(cmd, ["test"], "prog");
    expect(output).toContain("-j, --json");
  });

  it("should show type hint for non-boolean flags", () => {
    const cmd = makeCommand({
      flags: [{ name: "from", description: "Start stage", type: "string" }],
    });
    const output = formatCommandHelp(cmd, ["test"], "prog");
    expect(output).toContain("--from <string>");
  });
});

describe("formatRootHelp", () => {
  it("should include version, usage, and all commands", () => {
    const commands = [
      makeCommand({ name: "init", description: "Initialize project", usage: "micode-beads init [--mindmodel]" }),
      makeCommand({ name: "doctor", description: "Diagnose health", usage: "micode-beads doctor [--fix]" }),
    ];
    const output = formatRootHelp(commands, "micode-beads", "1.2.3");
    expect(output).toContain("micode-beads v1.2.3");
    expect(output).toContain("Usage: micode-beads <command> [options]");
    expect(output).toContain("init [--mindmodel]");
    expect(output).toContain("Initialize project");
    expect(output).toContain("doctor [--fix]");
    expect(output).toContain("Diagnose health");
    expect(output).toContain("--help");
    expect(output).toContain("--version");
  });

  it("should fall back to command name when usage has no program prefix", () => {
    const commands = [makeCommand({ name: "test", description: "Run tests", usage: "custom usage" })];
    const output = formatRootHelp(commands, "prog", "0.1.0");
    expect(output).toContain("custom usage");
    expect(output).toContain("Run tests");
  });
});

describe("dispatch", () => {
  const captured: { stdout: string[] } = { stdout: [] };
  const originalLog = console.log;

  function captureConsole(): void {
    captured.stdout = [];
    console.log = (...args: unknown[]) => {
      captured.stdout.push(args.map(String).join(" "));
    };
  }

  function restoreConsole(): void {
    console.log = originalLog;
  }

  const commands = [
    makeCommand({
      name: "init",
      description: "Initialize",
      flags: [{ name: "mindmodel", description: "Scaffold mindmodel", type: "boolean" }],
      handler: async (args) => {
        captured.stdout.push(`init:mindmodel=${args.flags.mindmodel}`);
        return 0;
      },
    }),
    makeCommand({
      name: "doctor",
      description: "Diagnose",
      flags: [
        { name: "fix", description: "Fix", type: "boolean" },
        { name: "json", description: "JSON", type: "boolean" },
      ],
      handler: async (args) => {
        captured.stdout.push(`doctor:fix=${args.flags.fix},json=${args.flags.json}`);
        return args.flags.fix ? 0 : 1;
      },
    }),
    makeCommand({
      name: "workflow",
      description: "Workflow management",
      usage: "prog workflow <command>",
      subcommands: [
        makeCommand({
          name: "status",
          description: "Show status",
          positional: [{ name: "feature-id", description: "Feature", required: true }],
          flags: [{ name: "json", description: "JSON", type: "boolean" }],
          handler: async (args) => {
            captured.stdout.push(`workflow:status:${args.positional[0]}:json=${args.flags.json}`);
            return 0;
          },
        }),
      ],
      handler: async () => {
        captured.stdout.push("workflow:root");
        return 0;
      },
    }),
  ];

  const opts = {
    programName: "prog",
    version: "1.0.0",
  };

  it("should show version with --version", async () => {
    captureConsole();
    const code = await dispatch(commands, ["--version"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout.join("")).toContain("prog v1.0.0");
  });

  it("should show version with -v", async () => {
    captureConsole();
    const code = await dispatch(commands, ["-v"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout.join("")).toContain("prog v1.0.0");
  });

  it("should show root help with no args", async () => {
    captureConsole();
    const code = await dispatch(commands, [], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout.join("\n")).toContain("Usage: prog <command>");
  });

  it("should show root help with --help", async () => {
    captureConsole();
    const code = await dispatch(commands, ["--help"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout.join("\n")).toContain("Usage: prog <command>");
  });

  it("should show command help with command --help", async () => {
    captureConsole();
    const code = await dispatch(commands, ["doctor", "--help"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout.join("\n")).toContain("Diagnose");
    expect(captured.stdout.join("\n")).toContain("--fix");
  });

  it("should dispatch to command handler", async () => {
    captureConsole();
    const code = await dispatch(commands, ["init", "--mindmodel"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout).toContain("init:mindmodel=true");
  });

  it("should dispatch to command handler without flags", async () => {
    captureConsole();
    const code = await dispatch(commands, ["init"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout).toContain("init:mindmodel=false");
  });

  it("should return handler exit code", async () => {
    captureConsole();
    const code = await dispatch(commands, ["doctor"], opts);
    restoreConsole();
    expect(code).toBe(1);
    expect(captured.stdout).toContain("doctor:fix=false,json=false");
  });

  it("should dispatch nested subcommands", async () => {
    captureConsole();
    const code = await dispatch(commands, ["workflow", "status", "my-feature", "--json"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout).toContain("workflow:status:my-feature:json=true");
  });

  it("should return EXIT_USAGE for unknown command", async () => {
    const errors: string[] = [];
    const code = await dispatch(commands, ["foobar"], {
      ...opts,
      onError: (msg) => errors.push(msg),
    });
    expect(code).toBe(2);
    expect(errors[0]).toContain("Unknown command: foobar");
    expect(errors[0]).toContain("Available commands:");
  });

  it("should return EXIT_USAGE for unknown flags", async () => {
    const errors: string[] = [];
    const code = await dispatch(commands, ["init", "--unknown"], {
      ...opts,
      onError: (msg) => errors.push(msg),
    });
    expect(code).toBe(2);
    expect(errors[0]).toContain("Unknown flag: --unknown");
  });

  it("should return EXIT_USAGE for missing required positional", async () => {
    const errors: string[] = [];
    const code = await dispatch(commands, ["workflow", "status"], {
      ...opts,
      onError: (msg) => errors.push(msg),
    });
    expect(code).toBe(2);
    expect(errors[0]).toContain("<feature-id>");
  });

  it("should use custom onVersion callback", async () => {
    let called = false;
    const code = await dispatch(commands, ["--version"], {
      ...opts,
      onVersion: () => {
        called = true;
      },
    });
    expect(code).toBe(0);
    expect(called).toBe(true);
  });

  it("should show help for nested parent command with --help", async () => {
    captureConsole();
    const code = await dispatch(commands, ["workflow", "--help"], opts);
    restoreConsole();
    expect(code).toBe(0);
    expect(captured.stdout.join("\n")).toContain("Workflow management");
    expect(captured.stdout.join("\n")).toContain("status");
  });
});
