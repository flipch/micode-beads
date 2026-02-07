import { verifierAgent } from "../../../agents/verifier";
import type { KnowledgeFragment } from "../../types";

export const verifierPrompt: KnowledgeFragment = {
  name: "verifier-prompt",
  category: "workflow",
  description: "Verifier agent full prompt - post-implementation verification, completeness, coverage, plan adherence",
  content: verifierAgent.prompt!,
};
