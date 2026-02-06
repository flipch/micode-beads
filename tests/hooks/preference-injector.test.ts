import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PluginInput } from "@opencode-ai/plugin";
import { stringify as stringifyYaml } from "yaml";

import type { MicodeConfig } from "../../src/config-loader";
import type { Preference, PreferenceStore } from "../../src/preferences/types";

function createMockCtx(directory: string): PluginInput {
  return {
    directory,
    client: {
      session: {},
      tui: {},
    },
  } as unknown as PluginInput;
}

function makePreference(overrides: Partial<Preference> = {}): Preference {
  return {
    id: `pref-${Math.random().toString(36).slice(2, 10)}`,
    category: "code-style",
    description: "Prefer early returns over nested if/else",
    scope: { type: "project" },
    enabled: true,
    provenance: { source: "manual", date: "2026-02-05" },
    createdAt: "2026-02-05T10:00:00Z",
    updatedAt: "2026-02-05T10:00:00Z",
    ...overrides,
  };
}

function writePreferencesFile(dir: string, preferences: Preference[]): void {
  const micodeDir = join(dir, ".micode");
  mkdirSync(micodeDir, { recursive: true });
  const store: PreferenceStore = { version: 1, preferences };
  writeFileSync(join(micodeDir, "preferences.yaml"), stringifyYaml(store));
}

describe("preference-injector", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "pref-injector-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("createPreferenceInjectorHook", () => {
    it("should inject preference XML block into system prompt", async () => {
      const prefs = [
        makePreference({ category: "naming-conventions", description: "Use PascalCase for types" }),
        makePreference({ category: "code-style", description: "Prefer early returns" }),
      ];
      writePreferencesFile(testDir, prefs);

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output = { system: "Original prompt", options: { agent: "implementer" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("<coding-preferences>");
      expect(output.system).toContain("Use PascalCase for types");
      expect(output.system).toContain("Prefer early returns");
      expect(output.system).toContain("Original prompt");
      expect(output.system.indexOf("<coding-preferences>")).toBeLessThan(output.system.indexOf("Original prompt"));
    });

    it("should be no-op when no preferences exist and methodology is default", async () => {
      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output = { system: "Original prompt", options: { agent: "implementer" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toBe("Original prompt");
    });

    it("should be no-op when agent is missing from options", async () => {
      const prefs = [makePreference()];
      writePreferencesFile(testDir, prefs);

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output = { system: "Original prompt", options: {} };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toBe("Original prompt");
    });

    it("should filter preferences by agent-category relevance for implementer", async () => {
      const prefs = [
        makePreference({ category: "naming-conventions", description: "PascalCase types" }),
        makePreference({ category: "testing", description: "Always mock external APIs" }),
        makePreference({ category: "methodology", description: "Use TDD" }),
      ];
      writePreferencesFile(testDir, prefs);

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output = { system: "Base prompt", options: { agent: "implementer" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("PascalCase types");
      expect(output.system).not.toContain("Always mock external APIs");
      expect(output.system).not.toContain("Use TDD");
    });

    it("should filter preferences by agent-category relevance for reviewer", async () => {
      const prefs = [
        makePreference({ category: "testing", description: "Write integration tests" }),
        makePreference({ category: "language-idioms", description: "Use async/await" }),
      ];
      writePreferencesFile(testDir, prefs);

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output = { system: "Base prompt", options: { agent: "reviewer" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("Write integration tests");
      expect(output.system).not.toContain("Use async/await");
    });

    it("should pass all categories for unknown agents (fallback)", async () => {
      const prefs = [
        makePreference({ category: "naming-conventions", description: "PascalCase" }),
        makePreference({ category: "testing", description: "Mock APIs" }),
        makePreference({ category: "methodology", description: "Use TDD" }),
      ];
      writePreferencesFile(testDir, prefs);

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output = { system: "Base prompt", options: { agent: "some-custom-agent" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("PascalCase");
      expect(output.system).toContain("Mock APIs");
      expect(output.system).toContain("Use TDD");
    });

    it("should inject methodology block for planner when TDD is active", async () => {
      const userConfig: MicodeConfig = { methodology: "tdd" };

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, userConfig);

      const output = { system: "Planner prompt", options: { agent: "planner" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("<active-methodology");
      expect(output.system).toContain("tdd");
      expect(output.system).toContain("CRITICAL TDD OVERRIDE");
    });

    it("should inject methodology block for executor when TDD is active", async () => {
      const userConfig: MicodeConfig = { methodology: "tdd" };

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, userConfig);

      const output = { system: "Executor prompt", options: { agent: "executor" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("<active-methodology");
      expect(output.system).toContain("TDD Execution Rules");
    });

    it("should inject methodology block for implementer when TDD is active", async () => {
      const userConfig: MicodeConfig = { methodology: "tdd" };

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, userConfig);

      const output = { system: "Impl prompt", options: { agent: "implementer" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("<active-methodology");
      expect(output.system).toContain("TDD Task Rules");
    });

    it("should not inject methodology block for non-methodology agents", async () => {
      const userConfig: MicodeConfig = { methodology: "tdd" };

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, userConfig);

      const output = { system: "Reviewer prompt", options: { agent: "reviewer" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).not.toContain("<active-methodology");
      expect(output.system).not.toContain("TDD");
    });

    it("should not inject methodology block when methodology is default", async () => {
      const prefs = [makePreference({ category: "code-style", description: "Early returns" })];
      writePreferencesFile(testDir, prefs);

      const userConfig: MicodeConfig = { methodology: "default" };

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, userConfig);

      const output = { system: "Planner prompt", options: { agent: "planner" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).not.toContain("<active-methodology");
    });

    it("should combine preferences and methodology for planner", async () => {
      const prefs = [makePreference({ category: "patterns", description: "Use factory pattern" })];
      writePreferencesFile(testDir, prefs);

      const userConfig: MicodeConfig = { methodology: "tdd" };

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, userConfig);

      const output = { system: "Planner prompt", options: { agent: "planner" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("<coding-preferences>");
      expect(output.system).toContain("Use factory pattern");
      expect(output.system).toContain("<active-methodology");
      expect(output.system).toContain("CRITICAL TDD OVERRIDE");
      expect(output.system).toContain("Planner prompt");
    });

    it("should exclude disabled preferences", async () => {
      const prefs = [
        makePreference({ category: "code-style", description: "Active preference", enabled: true }),
        makePreference({ category: "code-style", description: "Disabled preference", enabled: false }),
      ];
      writePreferencesFile(testDir, prefs);

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output = { system: "Base", options: { agent: "implementer" } };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toContain("Active preference");
      expect(output.system).not.toContain("Disabled preference");
    });

    it("should set system prompt when none exists", async () => {
      const prefs = [makePreference({ category: "code-style", description: "Early returns" })];
      writePreferencesFile(testDir, prefs);

      const { createPreferenceInjectorHook } = await import("../../src/hooks/preference-injector");
      const ctx = createMockCtx(testDir);
      const hooks = createPreferenceInjectorHook(ctx, null);

      const output: { system?: string; options: Record<string, unknown> } = {
        options: { agent: "implementer" },
      };
      await hooks["chat.params"]({ sessionID: "test" }, output);

      expect(output.system).toBeDefined();
      expect(output.system).toContain("<coding-preferences>");
    });
  });
});
