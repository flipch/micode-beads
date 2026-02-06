import type { PluginInput } from "@opencode-ai/plugin";

import type { MicodeConfig } from "../config-loader";
import { formatMethodologyBlock, formatPreferencesBlock } from "../preferences/formatter";
import { getActiveMethodology } from "../preferences/methodology";
import { resolvePreferences } from "../preferences/resolver";
import { clearCache, loadAllPreferences } from "../preferences/store";
import type { Preference } from "../preferences/types";
import { log } from "../utils/logger";

const MODULE = "preferences.injector";

/** Agent-to-category relevance mapping: each agent receives only relevant preference categories */
const AGENT_CATEGORY_RELEVANCE: Record<string, Set<string>> = {
  implementer: new Set(["naming-conventions", "parameter-style", "code-style", "patterns", "language-idioms"]),
  reviewer: new Set(["naming-conventions", "parameter-style", "code-style", "patterns", "testing"]),
  planner: new Set(["methodology", "patterns", "testing"]),
  executor: new Set(["methodology"]),
  brainstormer: new Set(["patterns", "methodology"]),
  commander: new Set(["methodology"]),
};

/** Agents that receive methodology prompt modifier blocks */
const METHODOLOGY_AGENTS = new Set(["planner", "executor", "implementer"]);

interface CachedPreferences {
  data: Preference[];
  timestamp: number;
}

function filterByAgentRelevance(preferences: Preference[], agentName: string): Preference[] {
  const relevantCategories = AGENT_CATEGORY_RELEVANCE[agentName];
  if (!relevantCategories) return preferences;
  return preferences.filter((p) => relevantCategories.has(p.category));
}

/**
 * Factory hook that injects formatted preferences and methodology blocks
 * into agent system prompts during the chat.params lifecycle.
 */
export function createPreferenceInjectorHook(ctx: PluginInput, userConfig: MicodeConfig | null) {
  let cached: CachedPreferences | null = null;
  const cacheTtlMs = 30_000;

  async function getCachedPreferences(): Promise<Preference[]> {
    const now = Date.now();
    if (cached && now - cached.timestamp < cacheTtlMs) {
      return cached.data;
    }

    try {
      clearCache();
      const preferences = await loadAllPreferences(ctx.directory);
      cached = { data: preferences, timestamp: now };
      return preferences;
    } catch (error) {
      log.warn(MODULE, `Failed to load preferences: ${error}`);
      return [];
    }
  }

  return {
    "chat.params": async (
      _input: { sessionID: string },
      output: { options?: Record<string, unknown>; system?: string },
    ) => {
      const agent = output.options?.agent as string | undefined;
      if (!agent) return;

      const allPreferences = await getCachedPreferences();
      if (allPreferences.length === 0 && (!userConfig?.methodology || userConfig.methodology === "default")) {
        return;
      }

      const resolved = resolvePreferences(allPreferences);
      const relevant = filterByAgentRelevance(resolved, agent);

      let injectionBlock = "";

      if (relevant.length > 0) {
        injectionBlock += formatPreferencesBlock(relevant);
      }

      const methodology = getActiveMethodology(ctx.directory, userConfig);
      if (methodology.name !== "default" && METHODOLOGY_AGENTS.has(agent)) {
        injectionBlock += formatMethodologyBlock(methodology);

        const agentModifierKey = `${agent}Instructions` as keyof typeof methodology.promptModifiers;
        const modifier = methodology.promptModifiers[agentModifierKey];
        if (modifier) {
          injectionBlock += `\n${modifier}\n`;
        }
      }

      if (!injectionBlock) return;

      if (output.system) {
        output.system = injectionBlock + output.system;
      } else {
        output.system = injectionBlock;
      }
    },
  };
}
