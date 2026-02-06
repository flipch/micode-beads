import { describe, expect, it } from "bun:test";

import { getEffectivePreferences, matchesFilePattern, resolvePreferences } from "../../src/preferences/resolver";
import type { Preference } from "../../src/preferences/types";

function makePreference(overrides: Partial<Preference> = {}): Preference {
  return {
    id: "pref-default1",
    category: "naming-conventions",
    description: "Use PascalCase for types",
    scope: { type: "project" },
    enabled: true,
    provenance: { source: "manual", date: "2026-02-05" },
    createdAt: "2026-02-05T10:00:00Z",
    updatedAt: "2026-02-05T10:00:00Z",
    ...overrides,
  };
}

describe("matchesFilePattern", () => {
  it("matches literal file paths", () => {
    expect(matchesFilePattern("src/index.ts", "src/index.ts")).toBe(true);
    expect(matchesFilePattern("src/other.ts", "src/index.ts")).toBe(false);
  });

  it("matches * for single segment characters", () => {
    expect(matchesFilePattern("src/index.ts", "src/*.ts")).toBe(true);
    expect(matchesFilePattern("src/utils.ts", "src/*.ts")).toBe(true);
    expect(matchesFilePattern("src/deep/index.ts", "src/*.ts")).toBe(false);
  });

  it("matches ** for recursive paths", () => {
    expect(matchesFilePattern("src/hooks/auth.ts", "src/**/*.ts")).toBe(true);
    expect(matchesFilePattern("src/deep/nested/file.ts", "src/**/*.ts")).toBe(true);
    expect(matchesFilePattern("src/index.ts", "src/**/*.ts")).toBe(true);
  });

  it("matches ** at the end", () => {
    expect(matchesFilePattern("tests/unit/auth.test.ts", "tests/**")).toBe(true);
    expect(matchesFilePattern("tests/integration/db.test.ts", "tests/**")).toBe(true);
    expect(matchesFilePattern("src/index.ts", "tests/**")).toBe(false);
  });

  it("matches *.test.ts pattern", () => {
    expect(matchesFilePattern("auth.test.ts", "*.test.ts")).toBe(true);
    expect(matchesFilePattern("auth.ts", "*.test.ts")).toBe(false);
    expect(matchesFilePattern("deep/auth.test.ts", "*.test.ts")).toBe(false);
  });

  it("matches ? for single character", () => {
    expect(matchesFilePattern("src/a.ts", "src/?.ts")).toBe(true);
    expect(matchesFilePattern("src/ab.ts", "src/?.ts")).toBe(false);
  });

  it("handles patterns with dots and special regex chars", () => {
    expect(matchesFilePattern("src/file.test.ts", "src/file.test.ts")).toBe(true);
    expect(matchesFilePattern("src/filextest.ts", "src/file.test.ts")).toBe(false);
  });
});

describe("resolvePreferences", () => {
  it("excludes disabled preferences", () => {
    const prefs = [makePreference({ id: "pref-1", enabled: true }), makePreference({ id: "pref-2", enabled: false })];

    const result = resolvePreferences(prefs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pref-1");
  });

  it("includes global and project scoped preferences without file path", () => {
    const prefs = [
      makePreference({ id: "pref-global", scope: { type: "global" } }),
      makePreference({ id: "pref-project", scope: { type: "project" } }),
      makePreference({ id: "pref-file", scope: { type: "file-pattern", pattern: "src/**" } }),
    ];

    const result = resolvePreferences(prefs);
    expect(result).toHaveLength(3);
  });

  it("filters file-pattern preferences by file path match", () => {
    const prefs = [
      makePreference({ id: "pref-match", scope: { type: "file-pattern", pattern: "src/**/*.ts" } }),
      makePreference({ id: "pref-nomatch", scope: { type: "file-pattern", pattern: "tests/**" } }),
      makePreference({ id: "pref-project", scope: { type: "project" } }),
    ];

    const result = resolvePreferences(prefs, { filePath: "src/hooks/auth.ts" });
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toContain("pref-match");
    expect(result.map((p) => p.id)).toContain("pref-project");
  });

  it("sorts by scope specificity: file-pattern > project > global", () => {
    const prefs = [
      makePreference({ id: "pref-global", scope: { type: "global" }, createdAt: "2026-02-05T12:00:00Z" }),
      makePreference({
        id: "pref-file",
        scope: { type: "file-pattern", pattern: "src/**" },
        createdAt: "2026-02-05T10:00:00Z",
      }),
      makePreference({ id: "pref-project", scope: { type: "project" }, createdAt: "2026-02-05T11:00:00Z" }),
    ];

    const result = resolvePreferences(prefs, { filePath: "src/index.ts" });
    expect(result[0].id).toBe("pref-file");
    expect(result[1].id).toBe("pref-project");
    expect(result[2].id).toBe("pref-global");
  });

  it("sorts by recency within the same scope level", () => {
    const prefs = [
      makePreference({ id: "pref-old", scope: { type: "project" }, createdAt: "2026-02-01T10:00:00Z" }),
      makePreference({ id: "pref-new", scope: { type: "project" }, createdAt: "2026-02-05T10:00:00Z" }),
    ];

    const result = resolvePreferences(prefs);
    expect(result[0].id).toBe("pref-new");
    expect(result[1].id).toBe("pref-old");
  });

  it("returns empty array when all preferences are disabled", () => {
    const prefs = [makePreference({ id: "pref-1", enabled: false }), makePreference({ id: "pref-2", enabled: false })];

    const result = resolvePreferences(prefs);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(resolvePreferences([])).toEqual([]);
  });
});

describe("getEffectivePreferences", () => {
  it("annotates preferences with effectiveScope", () => {
    const prefs = [makePreference({ id: "pref-1", scope: { type: "project" } })];

    const result = getEffectivePreferences(prefs, "src/index.ts");
    expect(result).toHaveLength(1);
    expect(result[0].effectiveScope).toBe("project");
    expect(result[0].overriddenBy).toBeUndefined();
  });

  it("marks lower-priority preferences as overridden within same category", () => {
    const prefs = [
      makePreference({
        id: "pref-global",
        category: "naming-conventions",
        scope: { type: "global" },
        description: "Global naming rule",
      }),
      makePreference({
        id: "pref-project",
        category: "naming-conventions",
        scope: { type: "project" },
        description: "Project naming rule",
      }),
    ];

    const result = getEffectivePreferences(prefs, "src/index.ts");
    expect(result).toHaveLength(2);

    const projectPref = result.find((p) => p.id === "pref-project");
    const globalPref = result.find((p) => p.id === "pref-global");

    expect(projectPref?.overriddenBy).toBeUndefined();
    expect(globalPref?.overriddenBy).toBe("pref-project");
  });

  it("file-pattern scope overrides project scope for matching file", () => {
    const prefs = [
      makePreference({
        id: "pref-project",
        category: "code-style",
        scope: { type: "project" },
      }),
      makePreference({
        id: "pref-file",
        category: "code-style",
        scope: { type: "file-pattern", pattern: "src/**/*.ts" },
      }),
    ];

    const result = getEffectivePreferences(prefs, "src/hooks/auth.ts");

    const filePref = result.find((p) => p.id === "pref-file");
    const projectPref = result.find((p) => p.id === "pref-project");

    expect(filePref?.overriddenBy).toBeUndefined();
    expect(filePref?.effectiveScope).toBe("file-pattern: src/**/*.ts");
    expect(projectPref?.overriddenBy).toBe("pref-file");
  });

  it("does not mark preferences in different categories as overriding each other", () => {
    const prefs = [
      makePreference({
        id: "pref-naming",
        category: "naming-conventions",
        scope: { type: "global" },
      }),
      makePreference({
        id: "pref-style",
        category: "code-style",
        scope: { type: "project" },
      }),
    ];

    const result = getEffectivePreferences(prefs, "src/index.ts");
    expect(result).toHaveLength(2);
    expect(result[0].overriddenBy).toBeUndefined();
    expect(result[1].overriddenBy).toBeUndefined();
  });

  it("most recent wins within same scope level for same category", () => {
    const prefs = [
      makePreference({
        id: "pref-old",
        category: "patterns",
        scope: { type: "project" },
        createdAt: "2026-01-01T10:00:00Z",
      }),
      makePreference({
        id: "pref-new",
        category: "patterns",
        scope: { type: "project" },
        createdAt: "2026-02-05T10:00:00Z",
      }),
    ];

    const result = getEffectivePreferences(prefs, "src/index.ts");

    const newPref = result.find((p) => p.id === "pref-new");
    const oldPref = result.find((p) => p.id === "pref-old");

    expect(newPref?.overriddenBy).toBeUndefined();
    expect(oldPref?.overriddenBy).toBe("pref-new");
  });

  it("excludes disabled preferences", () => {
    const prefs = [
      makePreference({ id: "pref-enabled", enabled: true }),
      makePreference({ id: "pref-disabled", enabled: false }),
    ];

    const result = getEffectivePreferences(prefs, "src/index.ts");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pref-enabled");
  });

  it("returns empty array for empty input", () => {
    expect(getEffectivePreferences([], "src/index.ts")).toEqual([]);
  });
});
