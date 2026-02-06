import { describe, expect, it } from "bun:test";

import { detectConflicts } from "../../src/preferences/conflict";
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

describe("detectConflicts", () => {
  it("detects conflict for same category and same scope type", () => {
    const incoming = makePreference({ id: "pref-new", description: "Use snake_case for types" });
    const existing = [makePreference({ id: "pref-old" })];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].existing.id).toBe("pref-old");
    expect(conflicts[0].incoming.id).toBe("pref-new");
    expect(conflicts[0].reason).toContain("naming-conventions");
  });

  it("returns empty array when categories differ", () => {
    const incoming = makePreference({ id: "pref-new", category: "code-style" });
    const existing = [makePreference({ id: "pref-old", category: "naming-conventions" })];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toEqual([]);
  });

  it("returns empty array when no existing preferences", () => {
    const incoming = makePreference({ id: "pref-new" });
    const conflicts = detectConflicts(incoming, []);
    expect(conflicts).toEqual([]);
  });

  it("skips disabled existing preferences", () => {
    const incoming = makePreference({ id: "pref-new" });
    const existing = [makePreference({ id: "pref-old", enabled: false })];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toEqual([]);
  });

  it("skips the same preference by ID", () => {
    const incoming = makePreference({ id: "pref-same" });
    const existing = [makePreference({ id: "pref-same" })];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toEqual([]);
  });

  it("detects conflict between global and project scopes", () => {
    const incoming = makePreference({ id: "pref-new", scope: { type: "global" } });
    const existing = [makePreference({ id: "pref-old", scope: { type: "project" } })];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toHaveLength(1);
  });

  it("detects conflict between project and file-pattern scopes", () => {
    const incoming = makePreference({ id: "pref-new", scope: { type: "project" } });
    const existing = [makePreference({ id: "pref-old", scope: { type: "file-pattern", pattern: "src/**/*.ts" } })];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toHaveLength(1);
  });

  it("detects conflict between overlapping file patterns", () => {
    const incoming = makePreference({
      id: "pref-new",
      scope: { type: "file-pattern", pattern: "src/**/*.ts" },
    });
    const existing = [
      makePreference({
        id: "pref-old",
        scope: { type: "file-pattern", pattern: "src/hooks/**" },
      }),
    ];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toHaveLength(1);
  });

  it("returns no conflict for disjoint file patterns", () => {
    const incoming = makePreference({
      id: "pref-new",
      scope: { type: "file-pattern", pattern: "src/**" },
    });
    const existing = [
      makePreference({
        id: "pref-old",
        scope: { type: "file-pattern", pattern: "tests/**" },
      }),
    ];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toEqual([]);
  });

  it("detects multiple conflicts across several existing preferences", () => {
    const incoming = makePreference({ id: "pref-new", scope: { type: "global" } });
    const existing = [
      makePreference({ id: "pref-a", scope: { type: "project" } }),
      makePreference({ id: "pref-b", scope: { type: "global" } }),
      makePreference({ id: "pref-c", category: "code-style" }),
    ];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.existing.id).sort()).toEqual(["pref-a", "pref-b"]);
  });

  it("treats wildcard-only patterns as overlapping with everything", () => {
    const incoming = makePreference({
      id: "pref-new",
      scope: { type: "file-pattern", pattern: "**/*.ts" },
    });
    const existing = [
      makePreference({
        id: "pref-old",
        scope: { type: "file-pattern", pattern: "src/utils/*.ts" },
      }),
    ];

    const conflicts = detectConflicts(incoming, existing);
    expect(conflicts).toHaveLength(1);
  });
});
