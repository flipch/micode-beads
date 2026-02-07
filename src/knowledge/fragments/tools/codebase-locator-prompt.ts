import { codebaseLocatorAgent } from "../../../agents/codebase-locator";
import type { KnowledgeFragment } from "../../types";

export const codebaseLocatorPrompt: KnowledgeFragment = {
  name: "codebase-locator-prompt",
  category: "tools",
  description: "Codebase locator agent full prompt - finds WHERE files live in the codebase",
  content: codebaseLocatorAgent.prompt!,
};
