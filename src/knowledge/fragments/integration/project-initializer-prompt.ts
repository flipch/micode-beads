import { projectInitializerAgent } from "../../../agents/project-initializer";
import type { KnowledgeFragment } from "../../types";

export const projectInitializerPrompt: KnowledgeFragment = {
  name: "project-initializer-prompt",
  category: "integration",
  description: "Project initializer agent full prompt - initializes projects with ARCHITECTURE.md and CODE_STYLE.md",
  content: projectInitializerAgent.prompt!,
};
