import { agentKnowledgeDefs, agents } from "../agents";
import { composePrompt, loadFragmentRegistry, validateFragments } from "../knowledge";
import { allFragments } from "../knowledge/fragments";
import type { AgentKnowledgeDef, FragmentRegistry } from "../knowledge/types";
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

function getKnowledgeDefMap(): Map<string, AgentKnowledgeDef> {
  return new Map(agentKnowledgeDefs.map((d) => [d.agent, d]));
}

function resolveAgentMode(name: string, config: { mode?: string }): string {
  if (config.mode) {
    return config.mode;
  }
  return name === "commander" ? "primary" : "subagent";
}

export function handleAgentList(opts: OutputOptions): number {
  const knowledgeDefMap = getKnowledgeDefMap();
  const agentEntries = Object.entries(agents);

  if (opts.json) {
    const data = agentEntries.map(([name, config]) => {
      const knowledgeDef = knowledgeDefMap.get(name);
      return {
        name,
        description: config.description ?? "",
        mode: resolveAgentMode(name, config),
        model: config.model ?? "",
        fragmentCount: knowledgeDef?.fragments.length ?? 0,
      };
    });
    writeJsonOutput(data, true);
    return EXIT_SUCCESS;
  }

  const headers = ["Name", "Description", "Mode", "Model"];
  const rows = agentEntries.map(([name, config]) => {
    const desc = config.description ?? "";
    const truncatedDesc = desc.length > 60 ? `${desc.slice(0, 57)}...` : desc;
    const mode = resolveAgentMode(name, config);
    const model = config.model ?? "";
    return [name, truncatedDesc, mode, model];
  });

  console.log("");
  console.log(colorize("Registered Agents", "\x1b[1m", opts));
  console.log("");
  console.log(formatTable(headers, rows, opts));
  console.log("");
  console.log(`Total: ${agentEntries.length} agents`);
  console.log("");
  return EXIT_SUCCESS;
}

export function handleAgentShow(agentName: string, opts: OutputOptions): number {
  const config = agents[agentName];
  if (!config) {
    const available = Object.keys(agents).join(", ");
    if (opts.json) {
      writeJsonError("AGENT_NOT_FOUND", `No agent found with name: ${agentName}`, `Available agents: ${available}`);
    } else {
      console.error(`No agent found with name: ${agentName}`);
      console.error(`Available agents: ${available}`);
    }
    return EXIT_VALIDATION;
  }

  const registry = getRegistry();
  const knowledgeDefMap = getKnowledgeDefMap();
  const knowledgeDef = knowledgeDefMap.get(agentName);

  let composedPrompt: string | undefined;
  if (knowledgeDef) {
    composedPrompt = composePrompt(knowledgeDef, registry);
  }

  const promptLength = composedPrompt?.length ?? config.prompt?.length ?? 0;

  if (opts.json) {
    writeJsonOutput(
      {
        name: agentName,
        description: config.description ?? "",
        mode: resolveAgentMode(agentName, config),
        model: config.model ?? "",
        temperature: config.temperature,
        fragments: knowledgeDef?.fragments ?? [],
        hasInlineContent: knowledgeDef?.inlineContent !== undefined && knowledgeDef.inlineContent !== null,
        promptLength,
        prompt: composedPrompt ?? config.prompt ?? "",
      },
      true,
    );
    return EXIT_SUCCESS;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize(`Agent: ${agentName}`, "\x1b[1m", opts));
  lines.push("");
  lines.push(`Description: ${config.description ?? "(none)"}`);
  lines.push(`Mode: ${resolveAgentMode(agentName, config)}`);
  lines.push(`Model: ${config.model ?? "(not set)"}`);
  if (config.temperature !== undefined) {
    lines.push(`Temperature: ${config.temperature}`);
  }
  lines.push(`Prompt length: ${promptLength} characters`);

  if (knowledgeDef) {
    lines.push("");
    lines.push(colorize("Knowledge Fragments:", "\x1b[1m", opts));
    for (let i = 0; i < knowledgeDef.fragments.length; i++) {
      const fragmentName = knowledgeDef.fragments[i];
      const fragment = registry.has(fragmentName) ? registry.get(fragmentName) : null;
      const category = fragment ? fragment.category : "unknown";
      lines.push(`  ${i + 1}. ${fragmentName} [${category}]`);
    }
    if (knowledgeDef.inlineContent) {
      lines.push(`  + inline content (${knowledgeDef.inlineContent.length} chars)`);
    }
  } else {
    lines.push("");
    lines.push("(No knowledge definition - uses inline prompt)");
  }

  if (composedPrompt) {
    lines.push("");
    lines.push(colorize("Prompt Preview:", "\x1b[1m", opts));
    const preview = composedPrompt.length > 500 ? `${composedPrompt.slice(0, 500)}...` : composedPrompt;
    lines.push(preview);
  }

  lines.push("");
  console.log(lines.join("\n"));
  return EXIT_SUCCESS;
}

export function handleAgentValidate(opts: OutputOptions): number {
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
  lines.push(colorize("Agent Knowledge Validation", "\x1b[1m", opts));
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
    lines.push(
      colorize("Validation failed. Fix errors above to ensure correct agent prompt composition.", "\x1b[31m", opts),
    );
  }
  lines.push("");

  if (result.valid) {
    console.log(lines.join("\n"));
  } else {
    console.error(lines.join("\n"));
  }

  return result.valid ? EXIT_SUCCESS : EXIT_VALIDATION;
}

const listCommand: SubcommandDef = {
  name: "list",
  description: "List all registered agents",
  usage: "micode-beads agent list [--json]",
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    const opts = detectOutputOptions(args.flags);
    return handleAgentList(opts);
  },
};

const showCommand: SubcommandDef = {
  name: "show",
  description: "Show agent details and knowledge fragments",
  usage: "micode-beads agent show <agent-name> [--json]",
  positional: [{ name: "agent-name", description: "Agent identifier", required: true }],
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    const opts = detectOutputOptions(args.flags);
    return handleAgentShow(args.positional[0], opts);
  },
};

const validateCommand: SubcommandDef = {
  name: "validate",
  description: "Validate agent knowledge fragment integrity",
  usage: "micode-beads agent validate [--json]",
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    const opts = detectOutputOptions(args.flags);
    return handleAgentValidate(opts);
  },
};

export const agentCommand: SubcommandDef = {
  name: "agent",
  description: "Inspect and validate agent configurations",
  usage: "micode-beads agent <command> [options]",
  subcommands: [listCommand, showCommand, validateCommand],
  handler: async () => {
    console.log(formatCommandHelp(agentCommand, ["agent"], "micode-beads"));
    return EXIT_SUCCESS;
  },
};
