#!/usr/bin/env bun

import pkg from "../../package.json";
import { runInit } from "./init";

const VERSION = pkg.version;

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

Options:
  -h, --help           Show this help message
  -v, --version        Show version number

Examples:
  micode-beads init
  micode-beads init --mindmodel
`);
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case "init":
      await runInit(process.argv.slice(3));
      break;
    case "--help":
    case "-h":
      printHelp();
      break;
    case "--version":
    case "-v":
      printVersion();
      break;
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
