import type { Preference, PreferenceScope } from "./types";

const SCOPE_PRIORITY: Record<PreferenceScope["type"], number> = {
  global: 0,
  project: 1,
  "file-pattern": 2,
};

/**
 * Resolves applicable preferences for a given context, filtered by enabled
 * status and scope. Returns preferences sorted by specificity (file-pattern
 * first, then project, then global) and by recency within the same level.
 */
export function resolvePreferences(
  allPreferences: Preference[],
  context: { filePath?: string; agentName?: string } = {},
): Preference[] {
  const applicable = allPreferences.filter((pref) => {
    if (!pref.enabled) return false;
    return isScopeApplicable(pref.scope, context.filePath);
  });

  return applicable.sort((a, b) => {
    const priorityDiff = SCOPE_PRIORITY[b.scope.type] - SCOPE_PRIORITY[a.scope.type];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Returns all preferences annotated with scope origin and override information.
 * For each category, the highest-priority preference (by scope specificity,
 * then recency) is effective; lower-priority ones are marked as overridden.
 */
export function getEffectivePreferences(
  allPreferences: Preference[],
  filePath: string,
): Array<Preference & { effectiveScope: string; overriddenBy?: string }> {
  const resolved = resolvePreferences(allPreferences, { filePath });

  const winnerByCategory = new Map<string, Preference>();
  for (const pref of resolved) {
    if (!winnerByCategory.has(pref.category)) {
      winnerByCategory.set(pref.category, pref);
    }
  }

  return resolved.map((pref) => {
    const winner = winnerByCategory.get(pref.category);
    const isWinner = winner?.id === pref.id;

    return {
      ...pref,
      effectiveScope: describeScopeOrigin(pref.scope),
      overriddenBy: isWinner ? undefined : winner?.id,
    };
  });
}

function isScopeApplicable(scope: PreferenceScope, filePath?: string): boolean {
  switch (scope.type) {
    case "global":
    case "project":
      return true;
    case "file-pattern":
      if (!filePath) return true;
      return matchesFilePattern(filePath, scope.pattern);
  }
}

/**
 * Glob matching for file-pattern scopes.
 * Supports *, **, and ? wildcards without adding external dependencies.
 *
 * - `*` matches any characters except path separator (/)
 * - `**` matches any characters including path separators (recursive)
 * - `?` matches any single character except path separator
 */
export function matchesFilePattern(filePath: string, pattern: string): boolean {
  const regexSource = globToRegex(pattern);
  const regex = new RegExp(`^${regexSource}$`);
  return regex.test(filePath);
}

function globToRegex(pattern: string): string {
  let result = "";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          result += "(?:.+/)?";
          i += 3;
        } else {
          result += ".*";
          i += 2;
        }
      } else {
        result += "[^/]*";
        i++;
      }
    } else if (char === "?") {
      result += "[^/]";
      i++;
    } else if (isRegexSpecialChar(char)) {
      result += `\\${char}`;
      i++;
    } else {
      result += char;
      i++;
    }
  }

  return result;
}

const REGEX_SPECIAL_CHARS = new Set([".", "+", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);

function isRegexSpecialChar(char: string): boolean {
  return REGEX_SPECIAL_CHARS.has(char);
}

function describeScopeOrigin(scope: PreferenceScope): string {
  switch (scope.type) {
    case "global":
      return "global";
    case "project":
      return "project";
    case "file-pattern":
      return `file-pattern: ${scope.pattern}`;
  }
}
