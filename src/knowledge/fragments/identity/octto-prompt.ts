import { octtoAgent } from "../../../agents/octto";
import type { KnowledgeFragment } from "../../types";

export const octtoPrompt: KnowledgeFragment = {
  name: "octto-prompt",
  category: "identity",
  description: "Octto agent full prompt - interactive browser-based brainstorming with proactive suggestions",
  content: octtoAgent.prompt!,
  applicability: {
    modes: ["primary"],
  },
};
