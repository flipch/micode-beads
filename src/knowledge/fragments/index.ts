import type { KnowledgeFragment } from "../types";
import { primaryAgentEnv } from "./environment/primary-agent-env";
import { brainstormerCore } from "./identity/brainstormer-core";
import { commanderCore } from "./identity/commander-core";
import { octtoPrompt } from "./identity/octto-prompt";
import { prFeedbackPrompt } from "./integration/pr-feedback-prompt";
import { preferenceManagerPrompt } from "./integration/preference-manager-prompt";
import { projectInitializerPrompt } from "./integration/project-initializer-prompt";
import { artifactSearcherPrompt } from "./tools/artifact-searcher-prompt";
import { bootstrapperPrompt } from "./tools/bootstrapper-prompt";
import { codebaseAnalyzerPrompt } from "./tools/codebase-analyzer-prompt";
import { codebaseLocatorPrompt } from "./tools/codebase-locator-prompt";
import { patternFinderPrompt } from "./tools/pattern-finder-prompt";
import { probePrompt } from "./tools/probe-prompt";
import { executorPrompt } from "./workflow/executor-prompt";
import { implementerPrompt } from "./workflow/implementer-prompt";
import { ledgerCreatorPrompt } from "./workflow/ledger-creator-prompt";
import { plannerPrompt } from "./workflow/planner-prompt";
import { reviewerPrompt } from "./workflow/reviewer-prompt";
import { verifierPrompt } from "./workflow/verifier-prompt";

export {
  artifactSearcherPrompt,
  bootstrapperPrompt,
  brainstormerCore,
  codebaseAnalyzerPrompt,
  codebaseLocatorPrompt,
  commanderCore,
  executorPrompt,
  implementerPrompt,
  ledgerCreatorPrompt,
  octtoPrompt,
  patternFinderPrompt,
  plannerPrompt,
  prFeedbackPrompt,
  preferenceManagerPrompt,
  primaryAgentEnv,
  probePrompt,
  projectInitializerPrompt,
  reviewerPrompt,
  verifierPrompt,
};

export const allFragments: KnowledgeFragment[] = [
  primaryAgentEnv,
  commanderCore,
  brainstormerCore,
  octtoPrompt,
  plannerPrompt,
  executorPrompt,
  implementerPrompt,
  reviewerPrompt,
  verifierPrompt,
  ledgerCreatorPrompt,
  codebaseLocatorPrompt,
  codebaseAnalyzerPrompt,
  patternFinderPrompt,
  artifactSearcherPrompt,
  bootstrapperPrompt,
  probePrompt,
  prFeedbackPrompt,
  projectInitializerPrompt,
  preferenceManagerPrompt,
];
