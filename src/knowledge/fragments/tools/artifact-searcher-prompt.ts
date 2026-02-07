import { artifactSearcherAgent } from "../../../agents/artifact-searcher";
import type { KnowledgeFragment } from "../../types";

export const artifactSearcherPrompt: KnowledgeFragment = {
  name: "artifact-searcher-prompt",
  category: "tools",
  description: "Artifact searcher agent full prompt - searches past handoffs, plans, and ledgers",
  content: artifactSearcherAgent.prompt!,
};
