// tests/preferences/types.test.ts
import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { PREFERENCE_CATEGORIES, PreferenceSchema, PreferenceStoreSchema } from "../../src/preferences/types";

describe("PREFERENCE_CATEGORIES", () => {
  it("contains all 8 built-in categories", () => {
    expect(PREFERENCE_CATEGORIES).toEqual([
      "naming-conventions",
      "parameter-style",
      "code-style",
      "patterns",
      "methodology",
      "language-idioms",
      "testing",
      "documentation",
    ]);
    expect(PREFERENCE_CATEGORIES).toHaveLength(8);
  });
});

describe("PreferenceSchema", () => {
  const validPreference = {
    id: "pref-a1b2c3d4",
    category: "naming-conventions",
    description: "Use PascalCase for types",
    scope: { type: "project" as const },
    enabled: true,
    provenance: { source: "manual" as const, date: "2026-02-05" },
    createdAt: "2026-02-05T10:00:00Z",
    updatedAt: "2026-02-05T10:00:00Z",
  };

  it("validates a correct manual preference", () => {
    const result = v.parse(PreferenceSchema, validPreference);
    expect(result.id).toBe("pref-a1b2c3d4");
    expect(result.category).toBe("naming-conventions");
    expect(result.scope).toEqual({ type: "project" });
  });

  it("validates a preference with pr-feedback provenance", () => {
    const prPref = {
      ...validPreference,
      provenance: {
        source: "pr-feedback" as const,
        reviewer: "alice",
        date: "2026-02-04",
        originalComment: "Use named params for functions with >2 args",
      },
    };
    const result = v.parse(PreferenceSchema, prPref);
    expect(result.provenance.source).toBe("pr-feedback");
    expect(result.provenance.reviewer).toBe("alice");
    expect(result.provenance.originalComment).toBe("Use named params for functions with >2 args");
  });

  it("validates all three scope variants", () => {
    const globalPref = { ...validPreference, scope: { type: "global" as const } };
    const projectPref = { ...validPreference, scope: { type: "project" as const } };
    const filePref = {
      ...validPreference,
      scope: { type: "file-pattern" as const, pattern: "src/**/*.ts" },
    };

    expect(v.parse(PreferenceSchema, globalPref).scope).toEqual({ type: "global" });
    expect(v.parse(PreferenceSchema, projectPref).scope).toEqual({ type: "project" });
    expect(v.parse(PreferenceSchema, filePref).scope).toEqual({
      type: "file-pattern",
      pattern: "src/**/*.ts",
    });
  });

  it("validates a custom category string", () => {
    const customCat = { ...validPreference, category: "my-custom-category" };
    const result = v.parse(PreferenceSchema, customCat);
    expect(result.category).toBe("my-custom-category");
  });

  it("validates optional examples array", () => {
    const withExamples = {
      ...validPreference,
      examples: ["type UserProfile = { ... }", "function getUserProfile() { ... }"],
    };
    const result = v.parse(PreferenceSchema, withExamples);
    expect(result.examples).toEqual(["type UserProfile = { ... }", "function getUserProfile() { ... }"]);
  });

  it("rejects missing required fields", () => {
    const noId = { ...validPreference, id: undefined };
    expect(() => v.parse(PreferenceSchema, noId)).toThrow();

    const noCategory = { ...validPreference, category: undefined };
    expect(() => v.parse(PreferenceSchema, noCategory)).toThrow();

    const noDescription = { ...validPreference, description: undefined };
    expect(() => v.parse(PreferenceSchema, noDescription)).toThrow();
  });

  it("rejects invalid scope type", () => {
    const badScope = { ...validPreference, scope: { type: "invalid" } };
    expect(() => v.parse(PreferenceSchema, badScope)).toThrow();
  });

  it("rejects file-pattern scope without pattern field", () => {
    const missingPattern = { ...validPreference, scope: { type: "file-pattern" } };
    expect(() => v.parse(PreferenceSchema, missingPattern)).toThrow();
  });

  it("rejects invalid provenance source", () => {
    const badSource = {
      ...validPreference,
      provenance: { source: "unknown", date: "2026-02-05" },
    };
    expect(() => v.parse(PreferenceSchema, badSource)).toThrow();
  });
});

describe("PreferenceStoreSchema", () => {
  it("validates a well-formed store", () => {
    const store = {
      version: 1,
      preferences: [
        {
          id: "pref-1",
          category: "code-style",
          description: "Prefer early returns",
          scope: { type: "project" },
          enabled: true,
          provenance: { source: "manual", date: "2026-02-05" },
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
        },
      ],
    };
    const result = v.parse(PreferenceStoreSchema, store);
    expect(result.version).toBe(1);
    expect(result.preferences).toHaveLength(1);
  });

  it("validates an empty preferences array", () => {
    const store = { version: 1, preferences: [] };
    const result = v.parse(PreferenceStoreSchema, store);
    expect(result.preferences).toEqual([]);
  });

  it("rejects wrong version number", () => {
    const store = { version: 2, preferences: [] };
    expect(() => v.parse(PreferenceStoreSchema, store)).toThrow();
  });

  it("rejects missing version", () => {
    const store = { preferences: [] };
    expect(() => v.parse(PreferenceStoreSchema, store)).toThrow();
  });
});
