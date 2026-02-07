#!/usr/bin/env bun

import pkg from "../../package.json";
import { agentCommand } from "./agent";
import { runDoctor } from "./doctor";
import { createAttributedError, printError } from "./errors";
import { runInit } from "./init";
import { knowledgeCommand } from "./knowledge";
import { dispatch, type SubcommandDef } from "./router";
import { checkForUpdates } from "./update-checker";
import { workflowCommand } from "./workflow";

const VERSION = pkg.version;

const initCommand: SubcommandDef = {
  name: "init",
  description: "Initialize project for micode-beads",
  usage: "micode-beads init [--mindmodel]",
  flags: [
    {
      name: "mindmodel",
      description: "Scaffold .mindmodel/ constraint directory",
      type: "boolean",
    },
  ],
  handler: async (args) => {
    const initArgs: string[] = [];
    if (args.flags.mindmodel) initArgs.push("--mindmodel");
    await runInit(initArgs);
    return 0;
  },
};

const doctorCommand: SubcommandDef = {
  name: "doctor",
  description: "Diagnose installation and environment health",
  usage: "micode-beads doctor [--fix] [--json] [--verbose]",
  flags: [
    {
      name: "fix",
      description: "Attempt to auto-fix detected issues",
      type: "boolean",
    },
    {
      name: "json",
      description: "Output results as JSON",
      type: "boolean",
    },
    {
      name: "verbose",
      description: "Show detailed check information",
      type: "boolean",
    },
  ],
  handler: async (args) => {
    return await runDoctor(
      {
        fix: args.flags.fix === true,
        json: args.flags.json === true,
        verbose: args.flags.verbose === true,
      },
      VERSION,
    );
  },
};

export const commands: SubcommandDef[] = [initCommand, doctorCommand, workflowCommand, agentCommand, knowledgeCommand];

async function main(): Promise<void> {
  if (!process.env.MICODE_NO_UPDATE_CHECK) {
    checkForUpdates(VERSION).catch(() => {});
  }

  const exitCode = await dispatch(commands, process.argv.slice(2), {
    programName: "micode-beads",
    version: VERSION,
    onError: (message) => {
      printError(createAttributedError("cli", message, "Run `micode-beads --help` for available commands."));
    },
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
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
