import { codebaseAnalyzerAgent } from "../../../agents/codebase-analyzer";
import type { KnowledgeFragment } from "../../types";

export const codebaseAnalyzerPrompt: KnowledgeFragment = {
  name: "codebase-analyzer-prompt",
  category: "tools",
  description: "Codebase analyzer agent full prompt - explains HOW code works with file:line references",
  content: codebaseAnalyzerAgent.prompt!,
};
