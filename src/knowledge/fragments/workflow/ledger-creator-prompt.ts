import { ledgerCreatorAgent } from "../../../agents/ledger-creator";
import type { KnowledgeFragment } from "../../types";

export const ledgerCreatorPrompt: KnowledgeFragment = {
  name: "ledger-creator-prompt",
  category: "workflow",
  description: "Ledger creator agent full prompt - continuity ledger creation and updates for session state",
  content: ledgerCreatorAgent.prompt!,
};
