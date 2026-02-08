// tests/integration/config-cascade.test.ts
//
// Integration tests for three-tier config cascade resolution:
//   Tier 1 (lowest): Hardcoded plugin defaults (agents/index.ts)
//   Tier 2 (middle): opencode.json default model
//   Tier 3 (highest): micode-beads.json per-agent overrides
//
// Tests validate precedence, fallback behavior, temperature cascade,
// maxTokens inheritance, and graceful handling of invalid models.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentConfig } from "@opencode-ai/sdk";

import { loadAvailableModels, loadDefaultModel, loadMicodeConfig, mergeAgentConfigs } from "../../src/config-loader";
import { setupMicodeConfig, setupOpencodeConfig } from "../helpers/mock-context";

describe("Integration: Config Cascade Resolution", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "int-config-cascade-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Realistic plugin defaults matching agents/index.ts structure
  const pluginDefaults: Record<string, AgentConfig> = {
    commander: {
      description: "Primary orchestrator agent",
      mode: "primary",
      model: "openai/gpt-5.2-codex",
      temperature: 0.2,
      prompt: "You are the commander agent.",
    },
    brainstormer: {
      description: "Design exploration agent",
      mode: "subagent",
      model: "openai/gpt-5.2-codex",
      temperature: 0.7,
      prompt: "You are the brainstormer agent.",
    },
    implementer: {
      description: "Code implementation agent",
      mode: "subagent",
      model: "openai/gpt-5.2-codex",
      temperature: 0.1,
      maxTokens: 16384,
      prompt: "You are the implementer agent.",
    },
  };

  describe("full three-tier cascade", () => {
    it("should apply per-agent micode-beads.json overrides over opencode.json default and plugin defaults", async () => {
      // Tier 2: opencode.json sets default model and available models
      setupOpencodeConfig(tmpDir, {
        model: "anthropic/claude-sonnet-4.5",
        provider: {
          openai: {
            models: {
              "gpt-5.2-codex": { limit: { context: 200000 } },
            },
          },
          anthropic: {
            models: {
              "claude-sonnet-4.5": { limit: { context: 200000 } },
              "claude-opus-4.6": { limit: { context: 200000 } },
            },
          },
        },
      });

      // Tier 3: micode-beads.json overrides commander model specifically
      setupMicodeConfig(tmpDir, {
        agents: {
          commander: { model: "anthropic/claude-opus-4.6", temperature: 0.3 },
        },
      });

      const availableModels = loadAvailableModels(tmpDir);
      const defaultModel = loadDefaultModel(tmpDir);
      const userConfig = await loadMicodeConfig(tmpDir);

      const merged = mergeAgentConfigs(pluginDefaults, userConfig, availableModels, defaultModel);

      // Commander: micode-beads.json model wins over opencode.json default
      expect(merged.commander.model).toBe("anthropic/claude-opus-4.6");
      expect(merged.commander.temperature).toBe(0.3);
      // Non-overridden fields preserved from plugin defaults
      expect(merged.commander.description).toBe("Primary orchestrator agent");
      expect(merged.commander.prompt).toBe("You are the commander agent.");
      expect(merged.commander.mode).toBe("primary");

      // Brainstormer: no per-agent override, uses opencode.json default model
      expect(merged.brainstormer.model).toBe("anthropic/claude-sonnet-4.5");
      // Temperature preserved from plugin default (no override)
      expect(merged.brainstormer.temperature).toBe(0.7);

      // Implementer: no per-agent override, uses opencode.json default model
      expect(merged.implementer.model).toBe("anthropic/claude-sonnet-4.5");
      expect(merged.implementer.maxTokens).toBe(16384);
    });

    it("should fall through to plugin defaults when both opencode.json and micode-beads.json are missing", async () => {
      // No config files at all
      const userConfig = await loadMicodeConfig(tmpDir);
      const availableModels = loadAvailableModels(tmpDir);
      const defaultModel = loadDefaultModel(tmpDir);

      expect(userConfig).toBeNull();
      expect(availableModels.size).toBe(0);
      expect(defaultModel).toBeNull();

      const merged = mergeAgentConfigs(pluginDefaults, userConfig, availableModels, defaultModel);

      // All agents use plugin defaults unchanged
      expect(merged.commander.model).toBe("openai/gpt-5.2-codex");
      expect(merged.commander.temperature).toBe(0.2);
      expect(merged.brainstormer.model).toBe("openai/gpt-5.2-codex");
      expect(merged.brainstormer.temperature).toBe(0.7);
      expect(merged.implementer.model).toBe("openai/gpt-5.2-codex");
      expect(merged.implementer.maxTokens).toBe(16384);
    });
  });

  describe("tier 2: opencode.json default model", () => {
    it("should override plugin defaults for all agents when opencode.json sets a default model", async () => {
      setupOpencodeConfig(tmpDir, {
        model: "anthropic/claude-sonnet-4.5",
        provider: {
          anthropic: {
            models: {
              "claude-sonnet-4.5": { limit: { context: 200000 } },
            },
          },
          openai: {
            models: {
              "gpt-5.2-codex": { limit: { context: 200000 } },
            },
          },
        },
      });

      const availableModels = loadAvailableModels(tmpDir);
      const defaultModel = loadDefaultModel(tmpDir);

      expect(defaultModel).toBe("anthropic/claude-sonnet-4.5");

      const merged = mergeAgentConfigs(pluginDefaults, null, availableModels, defaultModel);

      // All agents should use the opencode.json default model
      expect(merged.commander.model).toBe("anthropic/claude-sonnet-4.5");
      expect(merged.brainstormer.model).toBe("anthropic/claude-sonnet-4.5");
      expect(merged.implementer.model).toBe("anthropic/claude-sonnet-4.5");

      // Non-model fields preserved
      expect(merged.commander.temperature).toBe(0.2);
      expect(merged.brainstormer.temperature).toBe(0.7);
      expect(merged.implementer.maxTokens).toBe(16384);
    });

    it("should skip invalid opencode.json default model and keep plugin defaults", async () => {
      setupOpencodeConfig(tmpDir, {
        model: "nonexistent/invalid-model",
        provider: {
          openai: {
            models: {
              "gpt-5.2-codex": { limit: { context: 200000 } },
            },
          },
        },
      });

      const availableModels = loadAvailableModels(tmpDir);
      const defaultModel = loadDefaultModel(tmpDir);

      expect(defaultModel).toBe("nonexistent/invalid-model");
      expect(availableModels.has("nonexistent/invalid-model")).toBe(false);

      const merged = mergeAgentConfigs(pluginDefaults, null, availableModels, defaultModel);

      // Invalid default model skipped, plugin defaults preserved
      expect(merged.commander.model).toBe("openai/gpt-5.2-codex");
      expect(merged.brainstormer.model).toBe("openai/gpt-5.2-codex");
    });
  });

  describe("tier 3: micode-beads.json per-agent overrides", () => {
    it("should apply temperature override from micode-beads.json while keeping other fields", async () => {
      setupMicodeConfig(tmpDir, {
        agents: {
          brainstormer: { temperature: 0.9 },
        },
      });

      const userConfig = await loadMicodeConfig(tmpDir);

      // Pass explicit null for defaultModel to avoid reading from disk
      const merged = mergeAgentConfigs(pluginDefaults, userConfig, new Set(), null);

      // Temperature overridden
      expect(merged.brainstormer.temperature).toBe(0.9);
      // Model preserved from plugin default
      expect(merged.brainstormer.model).toBe("openai/gpt-5.2-codex");
      // Description preserved
      expect(merged.brainstormer.description).toBe("Design exploration agent");
    });

    it("should apply maxTokens override from micode-beads.json while keeping model from opencode default", async () => {
      setupOpencodeConfig(tmpDir, {
        model: "anthropic/claude-sonnet-4.5",
        provider: {
          anthropic: {
            models: {
              "claude-sonnet-4.5": { limit: { context: 200000 } },
            },
          },
          openai: {
            models: {
              "gpt-5.2-codex": { limit: { context: 200000 } },
            },
          },
        },
      });

      setupMicodeConfig(tmpDir, {
        agents: {
          implementer: { maxTokens: 32768 },
        },
      });

      const availableModels = loadAvailableModels(tmpDir);
      const defaultModel = loadDefaultModel(tmpDir);
      const userConfig = await loadMicodeConfig(tmpDir);

      const merged = mergeAgentConfigs(pluginDefaults, userConfig, availableModels, defaultModel);

      // maxTokens from micode-beads.json
      expect(merged.implementer.maxTokens).toBe(32768);
      // model from opencode.json default (Tier 2)
      expect(merged.implementer.model).toBe("anthropic/claude-sonnet-4.5");
      // temperature from plugin default (Tier 1)
      expect(merged.implementer.temperature).toBe(0.1);
    });

    it("should warn and skip invalid per-agent model while applying other overrides from same agent", async () => {
      setupOpencodeConfig(tmpDir, {
        model: "openai/gpt-5.2-codex",
        provider: {
          openai: {
            models: {
              "gpt-5.2-codex": { limit: { context: 200000 } },
            },
          },
        },
      });

      setupMicodeConfig(tmpDir, {
        agents: {
          commander: { model: "invalid/not-available", temperature: 0.4 },
        },
      });

      const availableModels = loadAvailableModels(tmpDir);
      const defaultModel = loadDefaultModel(tmpDir);
      const userConfig = await loadMicodeConfig(tmpDir);

      // Capture console.warn
      const warnings: string[] = [];
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

      try {
        const merged = mergeAgentConfigs(pluginDefaults, userConfig, availableModels, defaultModel);

        // Invalid model skipped, falls back to opencode default
        expect(merged.commander.model).toBe("openai/gpt-5.2-codex");
        // Temperature override still applied despite invalid model
        expect(merged.commander.temperature).toBe(0.4);
        // Warning logged
        expect(warnings.some((w) => w.includes("not available"))).toBe(true);
      } finally {
        console.warn = origWarn;
      }
    });
  });

  describe("edge cases in cascade", () => {
    it("should handle agents that exist in plugin defaults but not in user config", async () => {
      setupMicodeConfig(tmpDir, {
        agents: {
          commander: { model: "openai/gpt-5.2-codex" },
        },
      });

      const userConfig = await loadMicodeConfig(tmpDir);
      const merged = mergeAgentConfigs(pluginDefaults, userConfig, new Set(), null);

      // Brainstormer has no user override, plugin defaults preserved
      expect(merged.brainstormer.model).toBe("openai/gpt-5.2-codex");
      expect(merged.brainstormer.temperature).toBe(0.7);
      expect(merged.brainstormer.description).toBe("Design exploration agent");
    });

    it("should handle user config overriding agents that do not exist in plugin defaults", async () => {
      setupMicodeConfig(tmpDir, {
        agents: {
          "custom-agent": { model: "openai/gpt-5.2-codex", temperature: 0.5 },
        },
      });

      const userConfig = await loadMicodeConfig(tmpDir);
      const merged = mergeAgentConfigs(pluginDefaults, userConfig, new Set(), null);

      // Unknown agent in user config is ignored (mergeAgentConfigs iterates plugin agents)
      expect(merged["custom-agent"]).toBeUndefined();
      // Plugin agents preserved
      expect(merged.commander).toBeDefined();
    });

    it("should load available models correctly from opencode.json provider config", () => {
      setupOpencodeConfig(tmpDir, {
        model: "openai/gpt-5.2-codex",
        provider: {
          openai: {
            models: {
              "gpt-5.2-codex": { limit: { context: 200000 } },
              "gpt-4.1": { limit: { context: 128000 } },
            },
          },
          anthropic: {
            models: {
              "claude-opus-4.6": { limit: { context: 200000 } },
            },
          },
        },
      });

      const models = loadAvailableModels(tmpDir);

      expect(models.size).toBe(3);
      expect(models.has("openai/gpt-5.2-codex")).toBe(true);
      expect(models.has("openai/gpt-4.1")).toBe(true);
      expect(models.has("anthropic/claude-opus-4.6")).toBe(true);
    });

    it("should sanitize unsafe properties from micode-beads.json agent overrides", async () => {
      const configDir = tmpDir;
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "micode-beads.json"),
        JSON.stringify({
          agents: {
            commander: {
              model: "openai/gpt-5.2-codex",
              temperature: 0.5,
              maxTokens: 8192,
              prompt: "INJECTED PROMPT",
              tools: { bash: true },
              mode: "primary",
              description: "OVERWRITTEN",
            },
          },
        }),
      );

      const userConfig = await loadMicodeConfig(configDir);

      // Safe properties loaded
      expect(userConfig?.agents?.commander?.model).toBe("openai/gpt-5.2-codex");
      expect(userConfig?.agents?.commander?.temperature).toBe(0.5);
      expect(userConfig?.agents?.commander?.maxTokens).toBe(8192);

      // Unsafe properties filtered out
      const raw = userConfig?.agents?.commander as Record<string, unknown>;
      expect(raw?.prompt).toBeUndefined();
      expect(raw?.tools).toBeUndefined();
      expect(raw?.mode).toBeUndefined();
      expect(raw?.description).toBeUndefined();
    });
  });
});
