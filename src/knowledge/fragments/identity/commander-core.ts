import { primaryAgent } from "../../../agents/commander";
import type { KnowledgeFragment } from "../../types";

const ENV_SUFFIX = "</environment>";

function extractAfterEnv(prompt: string): string {
  const envEnd = prompt.indexOf(ENV_SUFFIX);
  if (envEnd === -1) throw new Error("commander prompt missing </environment> tag");
  return prompt.slice(envEnd + ENV_SUFFIX.length + 2);
}

export const commanderCore: KnowledgeFragment = {
  name: "commander-core",
  category: "identity",
  description: "Commander agent core prompt - identity, rules, values, workflow orchestration, AFK mode, tool usage",
  content: extractAfterEnv(primaryAgent.prompt!),
};
