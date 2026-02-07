import { agentKnowledgeDefs } from "../agents";
import { loadFragmentRegistry, validateFragments } from "../knowledge";
import { allFragments } from "../knowledge/fragments";
import type { AgentKnowledgeDef, FragmentCategory, FragmentRegistry } from "../knowledge/types";
import { FRAGMENT_CATEGORIES } from "../knowledge/types";
import { EXIT_SUCCESS, EXIT_VALIDATION, formatCommandHelp, type SubcommandDef } from "./router";

interface JsonOutput<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string; suggestion?: string };
}

function writeJsonSuccess<T>(data: T): void {
  const output: JsonOutput<T> = { success: true, data };
  console.log(JSON.stringify(output, null, 2));
}

function writeJsonFail(code: string, message: string, suggestion?: string): void {
  const output: JsonOutput<null> = {
    success: false,
    data: null,
    error: { code, message, ...(suggestion ? { suggestion } : {}) },
  };
  console.log(JSON.stringify(output, null, 2));
}

function useColor(): boolean {
  return process.stdout.isTTY === true && !("NO_COLOR" in process.env);
}

function colorize(text: string, colorCode: string): string {
  return useColor() ? `${colorCode}${text}\x1b[0m` : text;
}

function formatSimpleTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, (row[i] ?? "").length), 0);
    return Math.max(h.length, maxData);
  });

  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  const dataLines = rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  "));

  return [headerLine, separator, ...dataLines].join("\n");
}

function getRegistry(): FragmentRegistry {
  return loadFragmentRegistry(allFragments);
}

function buildReferencedByMap(defs: AgentKnowledgeDef[]): Map<string, string[]> {
  const refMap = new Map<string, string[]>();
  for (const def of defs) {
    for (const fragmentName of def.fragments) {
      const agents = refMap.get(fragmentName) ?? [];
      agents.push(def.agent);
      refMap.set(fragmentName, agents);
    }
  }
  return refMap;
}

export function handleKnowledgeList(json: boolean, category?: string): number {
  const registry = getRegistry();
  const refMap = buildReferencedByMap(agentKnowledgeDefs);

  if (category && !FRAGMENT_CATEGORIES.includes(category as FragmentCategory)) {
    const validCategories = FRAGMENT_CATEGORIES.join(", ");
    if (json) {
      writeJsonFail("INVALID_CATEGORY", `Invalid category: "${category}"`, `Valid categories: ${validCategories}`);
    } else {
      console.error(`Invalid category: "${category}"`);
      console.error(`Valid categories: ${validCategories}`);
    }
    return EXIT_VALIDATION;
  }

  let fragmentNames = registry.names();
  if (category) {
    const categoryFragments = registry.byCategory(category as FragmentCategory);
    const categoryNameSet = new Set(categoryFragments.map((f) => f.name));
    fragmentNames = fragmentNames.filter((n) => categoryNameSet.has(n));
  }

  if (json) {
    const data = fragmentNames.map((name) => {
      const fragment = registry.get(name);
      return {
        name: fragment.name,
        category: fragment.category,
        description: fragment.description,
        referencedBy: refMap.get(name) ?? [],
        contentLength: fragment.content.length,
      };
    });
    writeJsonSuccess(data);
    return EXIT_SUCCESS;
  }

  const headers = ["Name", "Category", "Description", "Referenced By"];
  const rows = fragmentNames.map((name) => {
    const fragment = registry.get(name);
    const agents = refMap.get(name) ?? [];
    const desc = fragment.description.length > 40 ? `${fragment.description.slice(0, 37)}...` : fragment.description;
    const agentsStr =
      agents.length > 3 ? `${agents.slice(0, 3).join(", ")}... (+${agents.length - 3})` : agents.join(", ");
    return [fragment.name, fragment.category, desc, agentsStr || "(none)"];
  });

  console.log("");
  console.log(colorize(category ? `Knowledge Fragments [${category}]` : "Knowledge Fragments", "\x1b[1m"));
  console.log("");
  console.log(formatSimpleTable(headers, rows));
  console.log("");
  console.log(`Total: ${fragmentNames.length} fragments${category ? ` (filtered by category: ${category})` : ""}`);
  console.log("");
  return EXIT_SUCCESS;
}

export function handleKnowledgeValidate(json: boolean): number {
  const registry = getRegistry();
  const result = validateFragments(registry, agentKnowledgeDefs);

  if (json) {
    writeJsonSuccess({
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      totalFragments: registry.names().length,
      totalAgents: agentKnowledgeDefs.length,
    });
    return result.valid ? EXIT_SUCCESS : EXIT_VALIDATION;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize("Knowledge Fragment Validation", "\x1b[1m"));
  lines.push("");
  lines.push(`Fragments: ${registry.names().length}`);
  lines.push(`Agents with knowledge defs: ${agentKnowledgeDefs.length}`);
  lines.push("");

  if (result.errors.length > 0) {
    lines.push(colorize("Errors:", "\x1b[31m"));
    for (const err of result.errors) {
      lines.push(`  ${colorize("[ERROR]", "\x1b[31m")} ${err.message}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push(colorize("Warnings:", "\x1b[33m"));
    for (const warn of result.warnings) {
      lines.push(`  ${colorize("[WARN]", "\x1b[33m")} ${warn.message}`);
    }
    lines.push("");
  }

  if (result.valid && result.warnings.length === 0) {
    lines.push(colorize("All checks passed.", "\x1b[32m"));
  } else if (result.valid) {
    lines.push(colorize("Validation passed with warnings.", "\x1b[33m"));
  } else {
    lines.push(colorize("Validation failed. Fix errors above to ensure correct prompt composition.", "\x1b[31m"));
  }
  lines.push("");

  if (result.valid) {
    console.log(lines.join("\n"));
  } else {
    console.error(lines.join("\n"));
  }

  return result.valid ? EXIT_SUCCESS : EXIT_VALIDATION;
}

export function handleKnowledgeShow(fragmentName: string, json: boolean): number {
  const registry = getRegistry();

  if (!registry.has(fragmentName)) {
    const available = registry.names().join(", ");
    if (json) {
      writeJsonFail(
        "FRAGMENT_NOT_FOUND",
        `No fragment found with name: "${fragmentName}"`,
        `Available fragments: ${available}`,
      );
    } else {
      console.error(`No fragment found with name: "${fragmentName}"`);
      console.error(`Available fragments: ${available}`);
    }
    return EXIT_VALIDATION;
  }

  const fragment = registry.get(fragmentName);
  const refMap = buildReferencedByMap(agentKnowledgeDefs);
  const referencedBy = refMap.get(fragmentName) ?? [];

  if (json) {
    writeJsonSuccess({
      name: fragment.name,
      category: fragment.category,
      description: fragment.description,
      contentLength: fragment.content.length,
      content: fragment.content,
      applicability: fragment.applicability ?? null,
      referencedBy,
    });
    return EXIT_SUCCESS;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize(`Fragment: ${fragment.name}`, "\x1b[1m"));
  lines.push("");
  lines.push(`Category: ${fragment.category}`);
  lines.push(`Description: ${fragment.description}`);
  lines.push(`Content length: ${fragment.content.length} characters`);

  if (fragment.applicability) {
    lines.push("");
    lines.push(colorize("Applicability:", "\x1b[1m"));
    if (fragment.applicability.agents) {
      lines.push(`  Agents: ${fragment.applicability.agents.join(", ")}`);
    }
    if (fragment.applicability.features) {
      lines.push(`  Features: ${fragment.applicability.features.join(", ")}`);
    }
    if (fragment.applicability.modes) {
      lines.push(`  Modes: ${fragment.applicability.modes.join(", ")}`);
    }
  }

  lines.push("");
  if (referencedBy.length > 0) {
    lines.push(colorize("Referenced by:", "\x1b[1m"));
    for (const agent of referencedBy) {
      lines.push(`  - ${agent}`);
    }
  } else {
    lines.push("Referenced by: (none)");
  }

  lines.push("");
  lines.push(colorize("Content Preview:", "\x1b[1m"));
  const preview = fragment.content.length > 500 ? `${fragment.content.slice(0, 500)}...` : fragment.content;
  lines.push(preview);
  lines.push("");

  console.log(lines.join("\n"));
  return EXIT_SUCCESS;
}

const listCommand: SubcommandDef = {
  name: "list",
  description: "List all knowledge fragments",
  usage: "micode-beads knowledge list [--category <category>] [--json]",
  flags: [
    { name: "category", description: "Filter by fragment category", type: "string" },
    { name: "json", description: "Output as structured JSON", type: "boolean" },
  ],
  handler: async (args) => {
    return handleKnowledgeList(args.flags.json === true, args.flags.category as string | undefined);
  },
};

const validateCommand: SubcommandDef = {
  name: "validate",
  description: "Validate knowledge fragment integrity",
  usage: "micode-beads knowledge validate [--json]",
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    return handleKnowledgeValidate(args.flags.json === true);
  },
};

const showCommand: SubcommandDef = {
  name: "show",
  description: "Show knowledge fragment details and content",
  usage: "micode-beads knowledge show <fragment-name> [--json]",
  positional: [{ name: "fragment-name", description: "Fragment identifier", required: true }],
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    return handleKnowledgeShow(args.positional[0], args.flags.json === true);
  },
};

export const knowledgeCommand: SubcommandDef = {
  name: "knowledge",
  description: "Inspect and validate knowledge fragments",
  usage: "micode-beads knowledge <command> [options]",
  subcommands: [listCommand, showCommand, validateCommand],
  handler: async () => {
    console.log(formatCommandHelp(knowledgeCommand, ["knowledge"], "micode-beads"));
    return EXIT_SUCCESS;
  },
};
