import { prFeedbackAgent } from "../../../agents/pr-feedback";
import type { KnowledgeFragment } from "../../types";

export const prFeedbackPrompt: KnowledgeFragment = {
  name: "pr-feedback-prompt",
  category: "integration",
  description:
    "PR feedback agent full prompt - ingests GitHub PR review comments and generates corrective implementations",
  content: prFeedbackAgent.prompt!,
};
