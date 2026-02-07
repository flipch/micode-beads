import { patternFinderAgent } from "../../../agents/pattern-finder";
import type { KnowledgeFragment } from "../../types";

export const patternFinderPrompt: KnowledgeFragment = {
  name: "pattern-finder-prompt",
  category: "tools",
  description: "Pattern finder agent full prompt - finds existing patterns and examples to model after",
  content: patternFinderAgent.prompt!,
};
