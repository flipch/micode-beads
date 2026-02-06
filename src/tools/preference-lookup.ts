import type { PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

import {
  formatEffectivePreferencesReport,
  formatPreferencesBlock,
  getEffectivePreferences,
  loadAllPreferences,
  PREFERENCE_CATEGORIES,
  resolvePreferences,
} from "../preferences";
import { log } from "../utils/logger";

const MODULE = "preferences.lookup";

export function createPreferenceLookupTool(ctx: PluginInput) {
  const preference_lookup = tool({
    description: `Look up active coding preferences for the current project.
Query by category name (e.g., "naming-conventions", "code-style") or by keyword (e.g., "PascalCase", "early returns").
Optionally provide a file path to see which preferences apply to that specific file.
Returns formatted preferences matching the query.`,
    args: {
      query: tool.schema
        .string()
        .describe(
          'Category name or keyword to search (e.g., "naming-conventions", "testing", "PascalCase", "destructuring")',
        ),
      scope: tool.schema
        .string()
        .optional()
        .describe("Optional file path for scope-sensitive resolution (e.g., 'src/hooks/auth.ts')"),
    },
    execute: async ({ query, scope }) => {
      try {
        const allPreferences = await loadAllPreferences(ctx.directory);

        if (allPreferences.length === 0) {
          return "No preferences configured for this project. Use the /preference command to declare preferences.";
        }

        log.info(MODULE, `Looking up preferences for: "${query.slice(0, 100)}"`);

        if (scope) {
          const effective = getEffectivePreferences(allPreferences, scope);
          const filtered = filterByQuery(effective, query);

          if (filtered.length === 0) {
            return `No preferences matching "${query}" found for scope "${scope}". Use the /preference command to declare preferences.`;
          }

          log.info(MODULE, `Found ${filtered.length} effective preferences for scope "${scope}"`);
          return formatEffectivePreferencesReport(filtered);
        }

        const resolved = resolvePreferences(allPreferences);
        const filtered = filterByQuery(resolved, query);

        if (filtered.length === 0) {
          return `No preferences matching "${query}" found. Use the /preference command to declare preferences.`;
        }

        log.info(MODULE, `Found ${filtered.length} matching preferences`);
        return formatPreferencesBlock(filtered);
      } catch (error) {
        log.warn(MODULE, `Lookup failed: ${error instanceof Error ? error.message : "unknown"}`);
        return "Failed to load preferences. Use the /preference command to manage preferences.";
      }
    },
  });

  return { preference_lookup };
}

function filterByQuery<T extends { category: string; description: string }>(preferences: T[], query: string): T[] {
  const queryLower = query.toLowerCase().trim();

  const categories = PREFERENCE_CATEGORIES as readonly string[];
  if (categories.includes(queryLower)) {
    return preferences.filter((p) => p.category === queryLower);
  }

  const categoryMatch = preferences.filter((p) => p.category.toLowerCase() === queryLower);
  if (categoryMatch.length > 0) {
    return categoryMatch;
  }

  return preferences.filter((p) => {
    const descLower = p.description.toLowerCase();
    const catLower = p.category.toLowerCase();
    return descLower.includes(queryLower) || catLower.includes(queryLower);
  });
}
