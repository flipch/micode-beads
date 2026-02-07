import { agents } from "../../../agents";
import type { KnowledgeFragment } from "../../types";

function buildAgentList(): string {
  return Object.keys(agents).join(", ");
}

export const primaryAgentEnv: KnowledgeFragment = {
  name: "primary-agent-env",
  category: "environment",
  description:
    "Environment block for primary agents - identifies micode-beads plugin context, available agents, and Task tool usage",
  get content() {
    return `<environment>
You are running as part of the "micode-beads" OpenCode plugin (NOT Claude Code).
OpenCode is a different platform with its own agent system.
Available micode-beads agents: ${buildAgentList()}.
Use Task tool with subagent_type matching these agent names to spawn them.
</environment>`;
  },
  applicability: {
    modes: ["primary"],
  },
};
