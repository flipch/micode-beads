import { preferenceManagerAgent } from "../../../agents/preference-manager";
import type { KnowledgeFragment } from "../../types";

export const preferenceManagerPrompt: KnowledgeFragment = {
  name: "preference-manager-prompt",
  category: "integration",
  description: "Preference manager agent full prompt - manages coding preferences, captures PR feedback preferences",
  content: preferenceManagerAgent.prompt!,
};
