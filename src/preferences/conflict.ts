import type { Preference, PreferenceScope } from "./types";

export interface PreferenceConflict {
  existing: Preference;
  incoming: Preference;
  reason: string;
}

/**
 * Detects potential conflicts between an incoming preference and existing ones.
 * Conflict criteria: same category AND overlapping scope.
 * Does not perform semantic text analysis of descriptions.
 */
export function detectConflicts(incoming: Preference, existing: Preference[]): PreferenceConflict[] {
  const conflicts: PreferenceConflict[] = [];

  for (const entry of existing) {
    if (entry.id === incoming.id) continue;
    if (!entry.enabled) continue;
    if (entry.category !== incoming.category) continue;
    if (!scopesOverlap(incoming.scope, entry.scope)) continue;

    conflicts.push({
      existing: entry,
      incoming,
      reason: `Both preferences target category "${incoming.category}" with overlapping scope (${describeScopeOverlap(incoming.scope, entry.scope)})`,
    });
  }

  return conflicts;
}

function scopesOverlap(a: PreferenceScope, b: PreferenceScope): boolean {
  if (a.type === "global" || b.type === "global") {
    return true;
  }

  if (a.type === "project" && b.type === "project") {
    return true;
  }

  if (a.type === "file-pattern" && b.type === "file-pattern") {
    return filePatternsOverlap(a.pattern, b.pattern);
  }

  if ((a.type === "project" && b.type === "file-pattern") || (a.type === "file-pattern" && b.type === "project")) {
    return true;
  }

  return false;
}

/**
 * Determines whether two file-pattern globs could match the same files.
 * Uses a conservative heuristic: patterns overlap unless they target
 * completely disjoint literal prefixes.
 */
function filePatternsOverlap(a: string, b: string): boolean {
  const prefixA = extractLiteralPrefix(a);
  const prefixB = extractLiteralPrefix(b);

  if (prefixA.length === 0 || prefixB.length === 0) {
    return true;
  }

  const shorter = prefixA.length <= prefixB.length ? prefixA : prefixB;
  const longer = prefixA.length <= prefixB.length ? prefixB : prefixA;

  return longer.startsWith(shorter) || shorter.startsWith(longer);
}

/** Extracts the literal (non-glob) prefix from a pattern */
function extractLiteralPrefix(pattern: string): string {
  let prefix = "";
  for (const char of pattern) {
    if (char === "*" || char === "?" || char === "[" || char === "{") break;
    prefix += char;
  }
  return prefix;
}

function describeScopeOverlap(a: PreferenceScope, b: PreferenceScope): string {
  if (a.type === "global" && b.type === "global") return "both global";
  if (a.type === "global" || b.type === "global") return "global overlaps all scopes";
  if (a.type === "project" && b.type === "project") return "both project-scoped";

  if (a.type === "file-pattern" && b.type === "file-pattern") {
    return `file patterns "${a.pattern}" and "${b.pattern}"`;
  }

  return "project scope overlaps file patterns";
}
