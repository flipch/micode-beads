import { config } from "../utils/config";
import type { MethodologyProfile } from "./methodology";
import type { Preference } from "./types";

/** Formats active preferences as a structured XML block for system prompt injection */
export function formatPreferencesBlock(
  preferences: Preference[],
  maxTokens: number = config.preferences.maxInjectionTokens,
): string {
  if (preferences.length === 0) return "";

  const sorted = [...preferences].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const grouped = groupByCategory(sorted);
  const categoryNames = Object.keys(grouped);

  if (categoryNames.length === 0) return "";

  const maxChars = maxTokens * config.tokens.charsPerToken;

  let result = "<coding-preferences>\n";
  let currentChars = result.length + "</coding-preferences>\n".length;

  for (const category of categoryNames) {
    const prefs = grouped[category];
    const block = formatCategoryBlock(category, prefs);
    const blockChars = block.length;

    if (currentChars + blockChars > maxChars) {
      const remaining = maxChars - currentChars;
      if (remaining > 50) {
        const truncated = buildTruncatedCategory(category, prefs, remaining);
        if (truncated) {
          result += truncated;
        }
      }
      break;
    }

    result += block;
    currentChars += blockChars;
  }

  result += "</coding-preferences>\n";
  return result;
}

/** Formats a methodology profile as an XML block for system prompt injection */
export function formatMethodologyBlock(methodology: MethodologyProfile): string {
  if (methodology.name === "default") return "";

  const lines = [`<active-methodology name="${methodology.name}">`, methodology.description, "</active-methodology>"];

  return `${lines.join("\n")}\n`;
}

/** Formats effective preferences as a human-readable report showing scope and overrides */
export function formatEffectivePreferencesReport(
  preferences: Array<Preference & { effectiveScope: string; overriddenBy?: string }>,
): string {
  if (preferences.length === 0) return "No active preferences for this context.";

  const lines: string[] = ["Effective Preferences:", ""];
  const grouped = groupByCategory(preferences);

  for (const [category, prefs] of Object.entries(grouped)) {
    lines.push(`## ${category}`);
    for (const pref of prefs) {
      const scopeLabel = `[${pref.effectiveScope}]`;
      const overrideNote = pref.overriddenBy ? ` (overridden by: ${pref.overriddenBy})` : "";
      const statusLabel = pref.overriddenBy ? "~~" : "";
      lines.push(`- ${statusLabel}${pref.description}${statusLabel} ${scopeLabel}${overrideNote}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function groupByCategory<T extends { category: string }>(items: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item);
  }
  return grouped;
}

function formatCategoryBlock(category: string, preferences: Preference[]): string {
  const bullets = preferences.map((p) => {
    const line = `  - ${p.description}`;
    if (p.examples && p.examples.length > 0) {
      const exampleLines = p.examples.map((e) => `    e.g. ${e}`).join("\n");
      return `${line}\n${exampleLines}`;
    }
    return line;
  });

  return `  <category name="${category}">\n${bullets.join("\n")}\n  </category>\n`;
}

function buildTruncatedCategory(category: string, preferences: Preference[], maxChars: number): string | null {
  const header = `  <category name="${category}">\n`;
  const footer = "  </category>\n";
  const overhead = header.length + footer.length;

  if (overhead >= maxChars) return null;

  let body = "";
  const available = maxChars - overhead;

  for (const pref of preferences) {
    const line = `  - ${pref.description}\n`;
    if (body.length + line.length > available) break;
    body += line;
  }

  if (body.length === 0) return null;

  return header + body + footer;
}
