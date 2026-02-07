import type { KnowledgeFragment } from "../../types";

export const primaryAgentEnv: KnowledgeFragment = {
  name: "primary-agent-env",
  category: "environment",
  description:
    "Environment block for primary agents - identifies micode-beads plugin context, available agents, and Task tool usage",
  content: `<environment>
You are running as part of the "micode-beads" OpenCode plugin (NOT Claude Code).
OpenCode is a different platform with its own agent system.
Available micode-beads agents: commander, brainstormer, planner, executor, implementer, reviewer, codebase-locator, codebase-analyzer, pattern-finder, ledger-creator, artifact-searcher, mm-orchestrator.
Use Task tool with subagent_type matching these agent names to spawn them.
</environment>`,
  applicability: {
    modes: ["primary"],
  },
};
