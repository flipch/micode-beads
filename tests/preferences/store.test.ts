import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  addPreference,
  clearCache,
  deletePreference,
  loadAllPreferences,
  loadProjectPreferences,
  saveProjectPreferences,
  updatePreference,
} from "../../src/preferences/store";

describe("preference store", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "pref-store-test-"));
    clearCache();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    clearCache();
  });

  const validStoreYaml = `
version: 1
preferences:
  - id: "pref-existing1"
    category: "naming-conventions"
    description: "Use PascalCase for types"
    scope:
      type: "project"
    enabled: true
    provenance:
      source: "manual"
      date: "2026-02-05"
    createdAt: "2026-02-05T10:00:00Z"
    updatedAt: "2026-02-05T10:00:00Z"
  - id: "pref-existing2"
    category: "code-style"
    description: "Prefer early returns"
    scope:
      type: "project"
    enabled: true
    provenance:
      source: "pr-feedback"
      reviewer: "alice"
      date: "2026-02-04"
      originalComment: "Use early returns instead of nested ifs"
    createdAt: "2026-02-04T15:00:00Z"
    updatedAt: "2026-02-04T15:00:00Z"
`;

  function writeProjectPreferences(yaml: string): void {
    const dir = join(testDir, ".micode");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "preferences.yaml"), yaml);
  }

  function readProjectPreferencesRaw(): string {
    return readFileSync(join(testDir, ".micode", "preferences.yaml"), "utf-8");
  }

  describe("loadProjectPreferences", () => {
    it("loads preferences from a valid YAML file", async () => {
      writeProjectPreferences(validStoreYaml);
      const prefs = await loadProjectPreferences(testDir);

      expect(prefs).toHaveLength(2);
      expect(prefs[0].id).toBe("pref-existing1");
      expect(prefs[0].category).toBe("naming-conventions");
      expect(prefs[1].id).toBe("pref-existing2");
      expect(prefs[1].provenance.source).toBe("pr-feedback");
      expect(prefs[1].provenance.reviewer).toBe("alice");
    });

    it("returns empty array when file does not exist", async () => {
      const prefs = await loadProjectPreferences(testDir);
      expect(prefs).toEqual([]);
    });

    it("returns empty array for invalid YAML content", async () => {
      writeProjectPreferences("not: [valid: yaml: {broken");
      const prefs = await loadProjectPreferences(testDir);
      expect(prefs).toEqual([]);
    });

    it("returns empty array when YAML fails schema validation", async () => {
      writeProjectPreferences("version: 99\npreferences: []\n");
      const prefs = await loadProjectPreferences(testDir);
      expect(prefs).toEqual([]);
    });

    it("caches results on subsequent calls", async () => {
      writeProjectPreferences(validStoreYaml);
      const first = await loadProjectPreferences(testDir);
      expect(first).toHaveLength(2);

      // Overwrite the file with empty content
      writeProjectPreferences("version: 1\npreferences: []\n");

      // Should still return cached results
      const second = await loadProjectPreferences(testDir);
      expect(second).toHaveLength(2);
    });

    it("returns fresh data after cache is cleared", async () => {
      writeProjectPreferences(validStoreYaml);
      await loadProjectPreferences(testDir);

      writeProjectPreferences("version: 1\npreferences: []\n");
      clearCache();

      const prefs = await loadProjectPreferences(testDir);
      expect(prefs).toEqual([]);
    });
  });

  describe("saveProjectPreferences", () => {
    it("writes preferences as human-readable YAML", async () => {
      const prefs = [
        {
          id: "pref-save1",
          category: "patterns" as const,
          description: "Use factory functions",
          scope: { type: "project" as const },
          enabled: true,
          provenance: { source: "manual" as const, date: "2026-02-05" },
          createdAt: "2026-02-05T10:00:00Z",
          updatedAt: "2026-02-05T10:00:00Z",
        },
      ];

      await saveProjectPreferences(testDir, prefs);

      const raw = readProjectPreferencesRaw();
      const parsed = parseYaml(raw);
      expect(parsed.version).toBe(1);
      expect(parsed.preferences).toHaveLength(1);
      expect(parsed.preferences[0].id).toBe("pref-save1");
      expect(parsed.preferences[0].description).toBe("Use factory functions");
    });

    it("creates the .micode directory if it does not exist", async () => {
      await saveProjectPreferences(testDir, []);

      const raw = readProjectPreferencesRaw();
      const parsed = parseYaml(raw);
      expect(parsed.version).toBe(1);
      expect(parsed.preferences).toEqual([]);
    });

    it("invalidates cache after saving", async () => {
      writeProjectPreferences(validStoreYaml);
      const before = await loadProjectPreferences(testDir);
      expect(before).toHaveLength(2);

      await saveProjectPreferences(testDir, []);

      const after = await loadProjectPreferences(testDir);
      expect(after).toEqual([]);
    });
  });

  describe("addPreference", () => {
    it("generates an ID in pref-{8-char} format", async () => {
      const result = await addPreference(
        testDir,
        {
          category: "naming-conventions",
          description: "Use camelCase",
          scope: { type: "project" },
          enabled: true,
          provenance: { source: "manual", date: "2026-02-05" },
        },
        "project",
      );

      expect(result.id).toMatch(/^pref-[a-f0-9]{8}$/);
    });

    it("auto-sets createdAt and updatedAt timestamps", async () => {
      const before = new Date().toISOString();

      const result = await addPreference(
        testDir,
        {
          category: "code-style",
          description: "No semicolons",
          scope: { type: "project" },
          enabled: true,
          provenance: { source: "manual", date: "2026-02-05" },
        },
        "project",
      );

      const after = new Date().toISOString();
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
      expect(result.createdAt).toBe(result.updatedAt);
      expect(result.createdAt >= before).toBe(true);
      expect(result.createdAt <= after).toBe(true);
    });

    it("persists the new preference to the project file", async () => {
      await addPreference(
        testDir,
        {
          category: "patterns",
          description: "Prefer composition over inheritance",
          scope: { type: "project" },
          enabled: true,
          provenance: { source: "manual", date: "2026-02-05" },
        },
        "project",
      );

      clearCache();
      const prefs = await loadProjectPreferences(testDir);
      expect(prefs).toHaveLength(1);
      expect(prefs[0].description).toBe("Prefer composition over inheritance");
    });

    it("appends to existing preferences", async () => {
      writeProjectPreferences(validStoreYaml);

      await addPreference(
        testDir,
        {
          category: "testing",
          description: "Always mock external dependencies",
          scope: { type: "project" },
          enabled: true,
          provenance: { source: "manual", date: "2026-02-05" },
        },
        "project",
      );

      clearCache();
      const prefs = await loadProjectPreferences(testDir);
      expect(prefs).toHaveLength(3);
    });

    it("preserves PR feedback provenance metadata", async () => {
      const result = await addPreference(
        testDir,
        {
          category: "parameter-style",
          description: "Use named parameters for 3+ args",
          scope: { type: "project" },
          enabled: true,
          provenance: {
            source: "pr-feedback",
            reviewer: "bob",
            date: "2026-02-04",
            originalComment: "Please destructure params when there are many",
          },
        },
        "project",
      );

      expect(result.provenance.source).toBe("pr-feedback");
      expect(result.provenance.reviewer).toBe("bob");
      expect(result.provenance.originalComment).toBe("Please destructure params when there are many");
    });
  });

  describe("updatePreference", () => {
    it("updates description while preserving createdAt", async () => {
      writeProjectPreferences(validStoreYaml);

      const updated = await updatePreference(testDir, "pref-existing1", {
        description: "Use snake_case for types",
      });

      expect(updated).not.toBeNull();
      expect(updated!.description).toBe("Use snake_case for types");
      expect(updated!.createdAt).toBe("2026-02-05T10:00:00Z");
      expect(updated!.updatedAt).not.toBe("2026-02-05T10:00:00Z");
    });

    it("updates enabled status", async () => {
      writeProjectPreferences(validStoreYaml);

      const updated = await updatePreference(testDir, "pref-existing1", {
        enabled: false,
      });

      expect(updated).not.toBeNull();
      expect(updated!.enabled).toBe(false);
    });

    it("updates category and scope simultaneously", async () => {
      writeProjectPreferences(validStoreYaml);

      const updated = await updatePreference(testDir, "pref-existing1", {
        category: "language-idioms",
        scope: { type: "file-pattern", pattern: "src/**/*.ts" },
      });

      expect(updated).not.toBeNull();
      expect(updated!.category).toBe("language-idioms");
      expect(updated!.scope).toEqual({ type: "file-pattern", pattern: "src/**/*.ts" });
    });

    it("returns null when preference ID is not found", async () => {
      writeProjectPreferences(validStoreYaml);

      const result = await updatePreference(testDir, "pref-nonexistent", {
        description: "Something new",
      });

      expect(result).toBeNull();
    });

    it("persists the update to disk", async () => {
      writeProjectPreferences(validStoreYaml);

      await updatePreference(testDir, "pref-existing1", {
        description: "Updated description",
      });

      clearCache();
      const prefs = await loadProjectPreferences(testDir);
      const updated = prefs.find((p) => p.id === "pref-existing1");
      expect(updated!.description).toBe("Updated description");
    });
  });

  describe("deletePreference", () => {
    it("removes a preference and returns true", async () => {
      writeProjectPreferences(validStoreYaml);

      const result = await deletePreference(testDir, "pref-existing1");
      expect(result).toBe(true);

      clearCache();
      const prefs = await loadProjectPreferences(testDir);
      expect(prefs).toHaveLength(1);
      expect(prefs[0].id).toBe("pref-existing2");
    });

    it("returns false when preference ID is not found", async () => {
      writeProjectPreferences(validStoreYaml);

      const result = await deletePreference(testDir, "pref-nonexistent");
      expect(result).toBe(false);
    });

    it("handles deleting from an empty project", async () => {
      const result = await deletePreference(testDir, "pref-nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("loadAllPreferences", () => {
    it("combines project preferences with global (project only when no global file)", async () => {
      writeProjectPreferences(validStoreYaml);

      const all = await loadAllPreferences(testDir);
      // Global file likely doesn't exist in test env, so only project prefs
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.some((p) => p.id === "pref-existing1")).toBe(true);
      expect(all.some((p) => p.id === "pref-existing2")).toBe(true);
    });
  });
});
