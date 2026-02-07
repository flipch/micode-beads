import { implementerAgent } from "../../../agents/implementer";
import type { KnowledgeFragment } from "../../types";

export const implementerPrompt: KnowledgeFragment = {
  name: "implementer-prompt",
  category: "workflow",
  description: "Implementer agent full prompt - single micro-task execution, file creation, test verification",
  content: implementerAgent.prompt!,
};
