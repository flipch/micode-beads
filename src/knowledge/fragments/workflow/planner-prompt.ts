import { plannerAgent } from "../../../agents/planner";
import type { KnowledgeFragment } from "../../types";

export const plannerPrompt: KnowledgeFragment = {
  name: "planner-prompt",
  category: "workflow",
  description: "Planner agent full prompt - micro-task plan creation, dependency analysis, batch grouping",
  content: plannerAgent.prompt!,
};
