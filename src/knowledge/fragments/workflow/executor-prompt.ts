import { executorAgent } from "../../../agents/executor";
import type { KnowledgeFragment } from "../../types";

export const executorPrompt: KnowledgeFragment = {
  name: "executor-prompt",
  category: "workflow",
  description: "Executor agent full prompt - batch-first parallelism, implementer/reviewer/verifier coordination",
  content: executorAgent.prompt!,
};
