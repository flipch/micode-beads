export const EXIT_SUCCESS = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_WORKFLOW = 3;
export const EXIT_VALIDATION = 4;

export interface FlagDef {
  name: string;
  short?: string;
  description: string;
  type: "boolean" | "string" | "number";
  default?: unknown;
}

export interface PositionalDef {
  name: string;
  description: string;
  required: boolean;
}

export interface ParsedSubcommandArgs {
  flags: Record<string, unknown>;
  positional: string[];
}

export interface SubcommandDef {
  name: string;
  description: string;
  usage: string;
  flags?: FlagDef[];
  positional?: PositionalDef[];
  subcommands?: SubcommandDef[];
  handler: (args: ParsedSubcommandArgs) => Promise<number>;
}

export class RouterError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = "RouterError";
  }
}

interface ResolveResult {
  command: SubcommandDef;
  commandPath: string[];
  remainingArgs: string[];
}

export function resolveCommand(commands: SubcommandDef[], argv: string[]): ResolveResult | null {
  if (argv.length === 0) {
    return null;
  }

  const firstNonFlag = argv.findIndex((arg) => !arg.startsWith("-"));
  if (firstNonFlag === -1) {
    return null;
  }

  const commandName = argv[firstNonFlag];
  const command = commands.find((c) => c.name === commandName);
  if (!command) {
    return null;
  }

  const remainingArgs = [...argv.slice(0, firstNonFlag), ...argv.slice(firstNonFlag + 1)];
  const commandPath = [commandName];

  if (command.subcommands && command.subcommands.length > 0) {
    const subResult = resolveCommand(command.subcommands, remainingArgs);
    if (subResult) {
      return {
        command: subResult.command,
        commandPath: [...commandPath, ...subResult.commandPath],
        remainingArgs: subResult.remainingArgs,
      };
    }
  }

  return { command, commandPath, remainingArgs };
}

export function parseCommandArgs(command: SubcommandDef, argv: string[]): ParsedSubcommandArgs {
  const flags: Record<string, unknown> = {};
  const positional: string[] = [];
  const flagDefs = command.flags ?? [];

  for (const def of flagDefs) {
    if (def.default !== undefined) {
      flags[def.name] = def.default;
    } else if (def.type === "boolean") {
      flags[def.name] = false;
    }
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("-")) {
      let flagName: string;
      let inlineValue: string | undefined;

      if (arg.startsWith("--")) {
        const eqIdx = arg.indexOf("=");
        if (eqIdx !== -1) {
          flagName = arg.slice(2, eqIdx);
          inlineValue = arg.slice(eqIdx + 1);
        } else {
          flagName = arg.slice(2);
        }
      } else if (arg.length === 2) {
        const shortChar = arg.slice(1);
        const flagDef = flagDefs.find((f) => f.short === shortChar);
        if (!flagDef) {
          const available = flagDefs.map((f) => (f.short ? `-${f.short}, --${f.name}` : `--${f.name}`)).join(", ");
          throw new RouterError(
            `Unknown flag: ${arg}${available ? `\nAvailable flags: ${available}` : ""}`,
            EXIT_USAGE,
          );
        }
        flagName = flagDef.name;
      } else {
        positional.push(arg);
        i++;
        continue;
      }

      const def = flagDefs.find((f) => f.name === flagName);
      if (!def) {
        const available = flagDefs.map((f) => `--${f.name}`).join(", ");
        throw new RouterError(
          `Unknown flag: --${flagName}${available ? `\nAvailable flags: ${available}` : ""}`,
          EXIT_USAGE,
        );
      }

      if (def.type === "boolean") {
        flags[def.name] = true;
        i++;
        continue;
      }

      let value: string;
      if (inlineValue !== undefined) {
        value = inlineValue;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
        i++;
        value = argv[i];
      } else {
        throw new RouterError(`Flag --${def.name} requires a value of type ${def.type}.`, EXIT_USAGE);
      }

      if (def.type === "number") {
        const num = Number(value);
        if (Number.isNaN(num)) {
          throw new RouterError(`Invalid value for --${def.name}: expected a number, got "${value}".`, EXIT_USAGE);
        }
        flags[def.name] = num;
      } else {
        flags[def.name] = value;
      }

      i++;
      continue;
    }

    positional.push(arg);
    i++;
  }

  const positionalDefs = command.positional ?? [];
  for (let p = 0; p < positionalDefs.length; p++) {
    const pDef = positionalDefs[p];
    if (pDef.required && (positional.length <= p || positional[p] === undefined)) {
      throw new RouterError(`Missing required argument: <${pDef.name}>\nUsage: ${command.usage}`, EXIT_USAGE);
    }
  }

  return { flags, positional };
}

export function formatCommandHelp(command: SubcommandDef, commandPath: string[], programName: string): string {
  const lines: string[] = [];
  const fullCommand = [programName, ...commandPath].join(" ");

  lines.push(`Usage: ${command.usage || fullCommand}`);
  lines.push("");
  lines.push(command.description);

  if (command.subcommands && command.subcommands.length > 0) {
    lines.push("");
    lines.push("Commands:");
    const maxNameLen = Math.max(...command.subcommands.map((s) => s.name.length));
    for (const sub of command.subcommands) {
      lines.push(`  ${sub.name.padEnd(maxNameLen + 2)}${sub.description}`);
    }
  }

  if (command.positional && command.positional.length > 0) {
    lines.push("");
    lines.push("Arguments:");
    const maxNameLen = Math.max(...command.positional.map((p) => p.name.length + 2));
    for (const pos of command.positional) {
      const label = pos.required ? `<${pos.name}>` : `[${pos.name}]`;
      lines.push(`  ${label.padEnd(maxNameLen + 2)}${pos.description}`);
    }
  }

  const allFlags = [
    ...(command.flags ?? []),
    { name: "help", short: "h", description: "Show this help message", type: "boolean" as const },
  ];
  if (allFlags.length > 0) {
    lines.push("");
    lines.push("Options:");
    const entries = allFlags.map((f) => {
      const shortPart = f.short ? `-${f.short}, ` : "    ";
      const longPart = `--${f.name}`;
      const typePart = f.type !== "boolean" ? ` <${f.type}>` : "";
      return { label: `  ${shortPart}${longPart}${typePart}`, description: f.description };
    });
    const maxLabelLen = Math.max(...entries.map((e) => e.label.length));
    for (const entry of entries) {
      lines.push(`${entry.label.padEnd(maxLabelLen + 2)}${entry.description}`);
    }
  }

  return lines.join("\n");
}

function commandSynopsis(cmd: SubcommandDef, programName: string): string {
  const prefix = `${programName} `;
  if (cmd.usage.startsWith(prefix)) {
    return cmd.usage.slice(prefix.length);
  }
  return cmd.usage || cmd.name;
}

export function formatRootHelp(commands: SubcommandDef[], programName: string, version: string): string {
  const lines: string[] = [];

  lines.push(`${programName} v${version}`);
  lines.push("");
  lines.push(`Usage: ${programName} <command> [options]`);
  lines.push("");
  lines.push("Commands:");

  const synopses = commands.map((c) => commandSynopsis(c, programName));
  const maxSynLen = Math.max(...synopses.map((s) => s.length));
  for (let i = 0; i < commands.length; i++) {
    lines.push(`  ${synopses[i].padEnd(maxSynLen + 2)}${commands[i].description}`);
  }

  lines.push("");
  lines.push("Options:");
  lines.push("  -h, --help           Show this help message");
  lines.push("  -v, --version        Show version number");
  lines.push("");
  lines.push(`Run '${programName} <command> --help' for more information on a command.`);

  return lines.join("\n");
}

function hasHelpFlag(argv: string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

function stripHelpFlag(argv: string[]): string[] {
  return argv.filter((a) => a !== "--help" && a !== "-h");
}

export interface DispatchOptions {
  programName: string;
  version: string;
  onVersion?: () => void;
  onError?: (message: string) => void;
}

export async function dispatch(commands: SubcommandDef[], argv: string[], options: DispatchOptions): Promise<number> {
  if (argv.includes("--version") || argv.includes("-v")) {
    if (options.onVersion) {
      options.onVersion();
    } else {
      console.log(`${options.programName} v${options.version}`);
    }
    return EXIT_SUCCESS;
  }

  if (argv.length === 0 || (hasHelpFlag(argv) && !resolveCommand(commands, argv))) {
    console.log(formatRootHelp(commands, options.programName, options.version));
    return EXIT_SUCCESS;
  }

  const result = resolveCommand(commands, argv);

  if (!result) {
    const nonFlagArgs = argv.filter((a) => !a.startsWith("-"));
    const unknownCmd = nonFlagArgs[0] ?? argv[0];
    const available = commands.map((c) => c.name).join(", ");
    const message = `Unknown command: ${unknownCmd}\nAvailable commands: ${available}\nRun '${options.programName} --help' for usage information.`;
    if (options.onError) {
      options.onError(message);
    }
    return EXIT_USAGE;
  }

  const cleanedArgs = stripHelpFlag(result.remainingArgs);

  if (hasHelpFlag(result.remainingArgs)) {
    console.log(formatCommandHelp(result.command, result.commandPath, options.programName));
    return EXIT_SUCCESS;
  }

  try {
    const parsed = parseCommandArgs(result.command, cleanedArgs);
    return await result.command.handler(parsed);
  } catch (error) {
    if (error instanceof RouterError) {
      const message = `${error.message}\nRun '${options.programName} ${result.commandPath.join(" ")} --help' for usage information.`;
      if (options.onError) {
        options.onError(message);
      }
      return error.exitCode;
    }
    throw error;
  }
}
