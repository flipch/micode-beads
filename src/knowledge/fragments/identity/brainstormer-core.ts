import { brainstormerAgent } from "../../../agents/brainstormer";
import type { KnowledgeFragment } from "../../types";

const ENV_SUFFIX = "</environment>";

function extractAfterEnv(prompt: string): string {
  const envEnd = prompt.indexOf(ENV_SUFFIX);
  if (envEnd === -1) throw new Error("brainstormer prompt missing </environment> tag");
  return prompt.slice(envEnd + ENV_SUFFIX.length + 2);
}

export const brainstormerCore: KnowledgeFragment = {
  name: "brainstormer-core",
  category: "identity",
  description:
    "Brainstormer agent core prompt - design exploration, collaborative dialogue, AFK mode, subagent coordination",
  content: extractAfterEnv(brainstormerAgent.prompt!),
};
