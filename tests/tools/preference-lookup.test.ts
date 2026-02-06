import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearCache } from "../../src/preferences/store";
import { createPreferenceLookupTool } from "../../src/tools/preference-lookup";

function createMockCtx(directory: string) {
  return { directory } as { directory: string };
}

function writePreferencesYaml(projectDir: string, yaml: string): void {
  const micodeDir = join(projectDir, ".micode");
  mkdirSync(micodeDir, { recursive: true });
  writeFileSync(join(micodeDir, "preferences.yaml"), yaml, "utf-8");
}

const twoPreferencesYaml = `
version: 1
preferences:
  - id: "pref-naming1"
    category: "naming-conventions"
    description: "Use PascalCase for type and interface names"
    scope:
      type: "project"
    enabled: true
    provenance:
      source: "manual"
      date: "2026-02-05"
    createdAt: "2026-02-05T10:00:00Z"
    updatedAt: "2026-02-05T10:00:00Z"
  - id: "pref-style1"
    category: "code-style"
    description: "Prefer early returns over nested if/else blocks"
    scope:
      type: "project"
    enabled: true
    provenance:
      source: "pr-feedback"
      reviewer: "alice"
      date: "2026-02-04"
      originalComment: "Please use early returns here"
    createdAt: "2026-02-04T15:00:00Z"
    updatedAt: "2026-02-04T15:00:00Z"
`;

const scopedPreferencesYaml = `
version: 1
preferences:
  - id: "pref-global1"
    category: "naming-conventions"
    description: "Use camelCase for variables"
    scope:
      type: "global"
    enabled: true
    provenance:
      source: "manual"
      date: "2026-02-05"
    createdAt: "2026-02-05T10:00:00Z"
    updatedAt: "2026-02-05T10:00:00Z"
  - id: "pref-project1"
    category: "naming-conventions"
    description: "Use PascalCase for types"
    scope:
      type: "project"
    enabled: true
    provenance:
      source: "manual"
      date: "2026-02-05"
    createdAt: "2026-02-05T11:00:00Z"
    updatedAt: "2026-02-05T11:00:00Z"
  - id: "pref-pattern1"
    category: "testing"
    description: "Use describe/it blocks for test files"
    scope:
      type: "file-pattern"
      pattern: "tests/**/*.test.ts"
    enabled: true
    provenance:
      source: "manual"
      date: "2026-02-05"
    createdAt: "2026-02-05T12:00:00Z"
    updatedAt: "2026-02-05T12:00:00Z"
`;

describe("preference_lookup tool", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "pref-lookup-test-"));
    clearCache();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    clearCache();
  });

  it("returns message when no preferences exist", async () => {
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({ query: "naming-conventions" });

    expect(result).toContain("No preferences configured");
    expect(result).toContain("/preference");
  });

  it("filters by category name", async () => {
    writePreferencesYaml(testDir, twoPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({ query: "naming-conventions" });

    expect(result).toContain("PascalCase");
    expect(result).not.toContain("early returns");
  });

  it("filters by keyword in description", async () => {
    writePreferencesYaml(testDir, twoPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({ query: "early returns" });

    expect(result).toContain("early returns");
    expect(result).not.toContain("PascalCase");
  });

  it("returns all preferences for broad query matching category", async () => {
    writePreferencesYaml(testDir, twoPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({ query: "code-style" });

    expect(result).toContain("early returns");
  });

  it("returns useful message when no matches found", async () => {
    writePreferencesYaml(testDir, twoPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({ query: "nonexistent-xyz" });

    expect(result).toContain('No preferences matching "nonexistent-xyz"');
    expect(result).toContain("/preference");
  });

  it("resolves effective preferences for a file path scope", async () => {
    writePreferencesYaml(testDir, scopedPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({
      query: "testing",
      scope: "tests/hooks/auth.test.ts",
    });

    expect(result).toContain("describe/it blocks");
  });

  it("shows scope origin when querying with scope", async () => {
    writePreferencesYaml(testDir, scopedPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({
      query: "naming-conventions",
      scope: "src/index.ts",
    });

    expect(result).toContain("Effective Preferences:");
    expect(result).toContain("naming-conventions");
  });

  it("returns no-match message when scope query yields no results", async () => {
    writePreferencesYaml(testDir, scopedPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({
      query: "nonexistent-xyz",
      scope: "src/index.ts",
    });

    expect(result).toContain('No preferences matching "nonexistent-xyz"');
    expect(result).toContain("src/index.ts");
  });

  it("has proper tool description and args schema", () => {
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    expect(preference_lookup.description).toContain("preference");
    expect(preference_lookup.args).toHaveProperty("query");
    expect(preference_lookup.args).toHaveProperty("scope");
  });

  it("handles case-insensitive category matching", async () => {
    writePreferencesYaml(testDir, twoPreferencesYaml);
    const ctx = createMockCtx(testDir);
    const { preference_lookup } = createPreferenceLookupTool(ctx);

    const result = await preference_lookup.execute({ query: "Naming-Conventions" });

    expect(result).toContain("PascalCase");
  });
});
