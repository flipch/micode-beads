import { probeAgent } from "../../../agents/probe";
import type { KnowledgeFragment } from "../../types";

export const probePrompt: KnowledgeFragment = {
  name: "probe-prompt",
  category: "tools",
  description: "Probe agent full prompt - evaluates octto branch Q&A, decides whether to ask more or complete",
  content: probeAgent.prompt!,
};
