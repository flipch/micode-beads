import { agentKnowledgeDefs } from "../agents";
import { loadFragmentRegistry, validateFragments } from "../knowledge";
import { allFragments } from "../knowledge/fragments";
import type { AgentKnowledgeDef, FragmentCategory, FragmentRegistry } from "../knowledge/types";
import { FRAGMENT_CATEGORIES } from "../knowledge/types";
import {
  colorize,
  detectOutputOptions,
  formatTable,
  type OutputOptions,
  writeJsonError,
  writeJsonOutput,
} from "./output";
import { EXIT_SUCCESS, EXIT_VALIDATION, formatCommandHelp, type SubcommandDef } from "./router";

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

export function handleKnowledgeList(opts: OutputOptions, category?: string): number {
  const registry = getRegistry();
  const refMap = buildReferencedByMap(agentKnowledgeDefs);

  if (category && !FRAGMENT_CATEGORIES.includes(category as FragmentCategory)) {
    const validCategories = FRAGMENT_CATEGORIES.join(", ");
    if (opts.json) {
      writeJsonError("INVALID_CATEGORY", `Invalid category: "${category}"`, `Valid categories: ${validCategories}`);
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

  if (opts.json) {
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
    writeJsonOutput(data, true);
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
  console.log(colorize(category ? `Knowledge Fragments [${category}]` : "Knowledge Fragments", "\x1b[1m", opts));
  console.log("");
  console.log(formatTable(headers, rows, opts));
  console.log("");
  console.log(`Total: ${fragmentNames.length} fragments${category ? ` (filtered by category: ${category})` : ""}`);
  console.log("");
  return EXIT_SUCCESS;
}

export function handleKnowledgeValidate(opts: OutputOptions): number {
  const registry = getRegistry();
  const result = validateFragments(registry, agentKnowledgeDefs);

  if (opts.json) {
    writeJsonOutput(
      {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        totalFragments: registry.names().length,
        totalAgents: agentKnowledgeDefs.length,
      },
      true,
    );
    return result.valid ? EXIT_SUCCESS : EXIT_VALIDATION;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize("Knowledge Fragment Validation", "\x1b[1m", opts));
  lines.push("");
  lines.push(`Fragments: ${registry.names().length}`);
  lines.push(`Agents with knowledge defs: ${agentKnowledgeDefs.length}`);
  lines.push("");

  if (result.errors.length > 0) {
    lines.push(colorize("Errors:", "\x1b[31m", opts));
    for (const err of result.errors) {
      lines.push(`  ${colorize("[ERROR]", "\x1b[31m", opts)} ${err.message}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push(colorize("Warnings:", "\x1b[33m", opts));
    for (const warn of result.warnings) {
      lines.push(`  ${colorize("[WARN]", "\x1b[33m", opts)} ${warn.message}`);
    }
    lines.push("");
  }

  if (result.valid && result.warnings.length === 0) {
    lines.push(colorize("All checks passed.", "\x1b[32m", opts));
  } else if (result.valid) {
    lines.push(colorize("Validation passed with warnings.", "\x1b[33m", opts));
  } else {
    lines.push(colorize("Validation failed. Fix errors above to ensure correct prompt composition.", "\x1b[31m", opts));
  }
  lines.push("");

  if (result.valid) {
    console.log(lines.join("\n"));
  } else {
    console.error(lines.join("\n"));
  }

  return result.valid ? EXIT_SUCCESS : EXIT_VALIDATION;
}

export function handleKnowledgeShow(fragmentName: string, opts: OutputOptions): number {
  const registry = getRegistry();

  if (!registry.has(fragmentName)) {
    const available = registry.names().join(", ");
    if (opts.json) {
      writeJsonError(
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

  if (opts.json) {
    writeJsonOutput(
      {
        name: fragment.name,
        category: fragment.category,
        description: fragment.description,
        contentLength: fragment.content.length,
        content: fragment.content,
        applicability: fragment.applicability ?? null,
        referencedBy,
      },
      true,
    );
    return EXIT_SUCCESS;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize(`Fragment: ${fragment.name}`, "\x1b[1m", opts));
  lines.push("");
  lines.push(`Category: ${fragment.category}`);
  lines.push(`Description: ${fragment.description}`);
  lines.push(`Content length: ${fragment.content.length} characters`);

  if (fragment.applicability) {
    lines.push("");
    lines.push(colorize("Applicability:", "\x1b[1m", opts));
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
    lines.push(colorize("Referenced by:", "\x1b[1m", opts));
    for (const agent of referencedBy) {
      lines.push(`  - ${agent}`);
    }
  } else {
    lines.push("Referenced by: (none)");
  }

  lines.push("");
  lines.push(colorize("Content Preview:", "\x1b[1m", opts));
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
    const opts = detectOutputOptions(args.flags);
    return handleKnowledgeList(opts, args.flags.category as string | undefined);
  },
};

const validateCommand: SubcommandDef = {
  name: "validate",
  description: "Validate knowledge fragment integrity",
  usage: "micode-beads knowledge validate [--json]",
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    const opts = detectOutputOptions(args.flags);
    return handleKnowledgeValidate(opts);
  },
};

const showCommand: SubcommandDef = {
  name: "show",
  description: "Show knowledge fragment details and content",
  usage: "micode-beads knowledge show <fragment-name> [--json]",
  positional: [{ name: "fragment-name", description: "Fragment identifier", required: true }],
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    const opts = detectOutputOptions(args.flags);
    return handleKnowledgeShow(args.positional[0], opts);
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
