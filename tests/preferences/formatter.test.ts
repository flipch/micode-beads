import { describe, expect, it } from "bun:test";

import {
  formatEffectivePreferencesReport,
  formatMethodologyBlock,
  formatPreferencesBlock,
} from "../../src/preferences/formatter";
import { BUILTIN_METHODOLOGIES } from "../../src/preferences/methodology";
import type { Preference } from "../../src/preferences/types";

function makePreference(overrides: Partial<Preference> = {}): Preference {
  return {
    id: "pref-test1",
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

describe("formatPreferencesBlock", () => {
  it("returns empty string for empty preferences", () => {
    expect(formatPreferencesBlock([])).toBe("");
  });

  it("formats a single preference in XML block", () => {
    const prefs = [makePreference()];
    const result = formatPreferencesBlock(prefs);

    expect(result).toContain("<coding-preferences>");
    expect(result).toContain("</coding-preferences>");
    expect(result).toContain('<category name="naming-conventions">');
    expect(result).toContain("Use PascalCase for types");
  });

  it("groups preferences by category", () => {
    const prefs = [
      makePreference({ id: "p1", category: "naming-conventions", description: "PascalCase types" }),
      makePreference({ id: "p2", category: "code-style", description: "Early returns" }),
      makePreference({ id: "p3", category: "naming-conventions", description: "camelCase functions" }),
    ];
    const result = formatPreferencesBlock(prefs);

    expect(result).toContain('<category name="naming-conventions">');
    expect(result).toContain('<category name="code-style">');
    expect(result).toContain("PascalCase types");
    expect(result).toContain("camelCase functions");
    expect(result).toContain("Early returns");
  });

  it("includes examples when present", () => {
    const prefs = [
      makePreference({
        description: "Use PascalCase",
        examples: ["type UserProfile = { ... }"],
      }),
    ];
    const result = formatPreferencesBlock(prefs);

    expect(result).toContain("Use PascalCase");
    expect(result).toContain("e.g. type UserProfile = { ... }");
  });

  it("enforces token budget by truncating", () => {
    const prefs = Array.from({ length: 50 }, (_, i) =>
      makePreference({
        id: `pref-${i}`,
        description: `This is a preference with a reasonably long description number ${i} to consume tokens`,
      }),
    );

    const tinyBudget = 50;
    const result = formatPreferencesBlock(prefs, tinyBudget);

    const charLimit = tinyBudget * 4;
    expect(result.length).toBeLessThanOrEqual(charLimit + 100);
  });

  it("prioritizes more recently updated preferences", () => {
    const prefs = [
      makePreference({ id: "p-old", description: "Old preference", updatedAt: "2026-01-01T00:00:00Z" }),
      makePreference({ id: "p-new", description: "New preference", updatedAt: "2026-02-05T00:00:00Z" }),
    ];

    const result = formatPreferencesBlock(prefs);

    const oldIdx = result.indexOf("Old preference");
    const newIdx = result.indexOf("New preference");
    expect(newIdx).toBeLessThan(oldIdx);
  });
});

describe("formatMethodologyBlock", () => {
  it("returns empty string for default methodology", () => {
    const result = formatMethodologyBlock(BUILTIN_METHODOLOGIES.default);
    expect(result).toBe("");
  });

  it("formats TDD methodology as XML block", () => {
    const result = formatMethodologyBlock(BUILTIN_METHODOLOGIES.tdd);

    expect(result).toContain('<active-methodology name="tdd">');
    expect(result).toContain("</active-methodology>");
    expect(result).toContain("Test-Driven Development");
  });
});

describe("formatEffectivePreferencesReport", () => {
  it("returns informative message for empty preferences", () => {
    const result = formatEffectivePreferencesReport([]);
    expect(result).toContain("No active preferences");
  });

  it("formats preferences with scope labels", () => {
    const prefs = [
      {
        ...makePreference({ category: "naming-conventions", description: "PascalCase types" }),
        effectiveScope: "project",
      },
    ];
    const result = formatEffectivePreferencesReport(prefs);

    expect(result).toContain("Effective Preferences:");
    expect(result).toContain("naming-conventions");
    expect(result).toContain("PascalCase types");
    expect(result).toContain("[project]");
  });

  it("shows override annotations", () => {
    const prefs = [
      {
        ...makePreference({ id: "p1", description: "Global rule" }),
        effectiveScope: "global",
        overriddenBy: "pref-project1",
      },
      {
        ...makePreference({ id: "p2", description: "Project rule" }),
        effectiveScope: "project",
      },
    ];
    const result = formatEffectivePreferencesReport(prefs);

    expect(result).toContain("overridden by: pref-project1");
    expect(result).toContain("~~Global rule~~");
    expect(result).not.toContain("~~Project rule~~");
  });
});
