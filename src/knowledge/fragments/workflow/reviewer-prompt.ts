import { reviewerAgent } from "../../../agents/reviewer";
import type { KnowledgeFragment } from "../../types";

export const reviewerPrompt: KnowledgeFragment = {
  name: "reviewer-prompt",
  category: "workflow",
  description: "Reviewer agent full prompt - micro-task review, plan compliance, test verification",
  content: reviewerAgent.prompt!,
};
