import { bootstrapperAgent } from "../../../agents/bootstrapper";
import type { KnowledgeFragment } from "../../types";

export const bootstrapperPrompt: KnowledgeFragment = {
  name: "bootstrapper-prompt",
  category: "tools",
  description: "Bootstrapper agent full prompt - creates exploration branches with scopes for octto brainstorming",
  content: bootstrapperAgent.prompt!,
};
