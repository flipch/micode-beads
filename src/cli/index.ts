#!/usr/bin/env bun

import pkg from "../../package.json";
import { runDoctor } from "./doctor";
import { createAttributedError, printError } from "./errors";
import { runInit } from "./init";
import { checkForUpdates } from "./update-checker";

const VERSION = pkg.version;

export interface ParsedArgs {
  command: string | undefined;
  flags: {
    help: boolean;
    version: boolean;
    fix: boolean;
    json: boolean;
    verbose: boolean;
    mindmodel: boolean;
  };
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = {
    help: false,
    version: false,
    fix: false,
    json: false,
    verbose: false,
    mindmodel: false,
  };

  let command: string | undefined;
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      flags.version = true;
    } else if (arg === "--fix") {
      flags.fix = true;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--verbose") {
      flags.verbose = true;
    } else if (arg === "--mindmodel") {
      flags.mindmodel = true;
    } else if (!arg.startsWith("-") && command === undefined) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

function printVersion(): void {
  console.log(`micode-beads v${VERSION}`);
}

function printHelp(): void {
  console.log(`
micode-beads v${VERSION}

Usage: micode-beads <command> [options]

Commands:
  init [--mindmodel]   Initialize project for micode-beads
                       --mindmodel  Scaffold .mindmodel/ directory
  doctor [--fix]       Diagnose installation and environment health
                       --fix        Attempt to auto-fix issues
                       --json       Output results as JSON
                       --verbose    Show detailed check information

Options:
  -h, --help           Show this help message
  -v, --version        Show version number

Examples:
  micode-beads init
  micode-beads init --mindmodel
  micode-beads doctor
  micode-beads doctor --fix
  micode-beads doctor --json
`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!process.env.MICODE_NO_UPDATE_CHECK) {
    checkForUpdates(VERSION).catch(() => {});
  }

  if (parsed.flags.version) {
    printVersion();
    return;
  }

  if (parsed.flags.help && !parsed.command) {
    printHelp();
    return;
  }

  switch (parsed.command) {
    case "init": {
      const initArgs: string[] = [];
      if (parsed.flags.mindmodel) initArgs.push("--mindmodel");
      await runInit(initArgs);
      break;
    }
    case "doctor": {
      const exitCode = await runDoctor(
        { fix: parsed.flags.fix, json: parsed.flags.json, verbose: parsed.flags.verbose },
        VERSION,
      );
      process.exit(exitCode);
      break;
    }
    case undefined:
      printHelp();
      break;
    default:
      printError(
        createAttributedError(
          "cli",
          `Unknown command: ${parsed.command}`,
          "Run `micode-beads --help` for available commands.",
        ),
      );
      process.exit(2);
  }
}

main().catch((error: unknown) => {
  printError(
    createAttributedError(
      "cli",
      error instanceof Error ? error.message : String(error),
      "Run `micode-beads doctor` to diagnose your setup.",
    ),
  );
  process.exit(1);
});
