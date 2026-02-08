// tests/integration/hook-pipeline-chain.test.ts
//
// Integration tests for hook pipeline chaining: verifies that 3+ hooks
// chaining modifications on the same chat.params output preserve each
// other's mutations, and that the ordering matches src/index.ts.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MicodeConfig } from "../../src/config-loader";
import { createContextInjectorHook } from "../../src/hooks/context-injector";
import { createFragmentInjectorHook } from "../../src/hooks/fragment-injector";
import { createLedgerLoaderHook } from "../../src/hooks/ledger-loader";
import {
  createMockChatParamsInput,
  createMockChatParamsOutput,
  createMockPluginCtx,
  setupLedgerFixture,
} from "../helpers/mock-context";

describe("Integration: Hook Pipeline Chaining", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "int-hook-chain-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("3-hook chain: fragment-injector -> ledger-loader -> context-injector", () => {
    it("should accumulate mutations from all 3 hooks on the same output object", async () => {
      writeFileSync(join(tmpDir, "README.md"), "# My Project\nA TypeScript API server.");
      setupLedgerFixture(tmpDir, "chain-session");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Always use async/await", "Prefer immutable data structures"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput({ system: "Base system prompt content." });

      // Run in src/index.ts order: fragment -> ledger -> context
      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;

      // All 3 hooks' content must be present
      expect(system).toContain("<user-instructions>");
      expect(system).toContain("Always use async/await");
      expect(system).toContain("Prefer immutable data structures");
      expect(system).toContain("<continuity-ledger");
      expect(system).toContain("JWT validation");
      expect(system).toContain("<project-context>");
      expect(system).toContain("TypeScript API server");
      // Base prompt preserved
      expect(system).toContain("Base system prompt content.");
    });

    it("should enforce ordering: ledger before fragments before base before context", async () => {
      // Fragment hook prepends, then ledger hook prepends after fragments,
      // so ledger ends up before fragments. Context hook appends, so it comes last.
      writeFileSync(join(tmpDir, "ARCHITECTURE.md"), "# Architecture\nLayered design.");
      setupLedgerFixture(tmpDir, "order-check");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["ORDER_MARKER_FRAGMENT"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput({ system: "ORDER_MARKER_BASE" });

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;

      const ledgerPos = system.indexOf("<continuity-ledger");
      const fragmentPos = system.indexOf("ORDER_MARKER_FRAGMENT");
      const basePos = system.indexOf("ORDER_MARKER_BASE");
      const contextPos = system.indexOf("<project-context>");

      expect(ledgerPos).toBeGreaterThanOrEqual(0);
      expect(fragmentPos).toBeGreaterThanOrEqual(0);
      expect(basePos).toBeGreaterThanOrEqual(0);
      expect(contextPos).toBeGreaterThanOrEqual(0);

      // Ledger prepends second (after fragment prepend), so it appears first
      expect(ledgerPos).toBeLessThan(fragmentPos);
      // Fragment prepends before base
      expect(fragmentPos).toBeLessThan(basePos);
      // Context appends after base
      expect(basePos).toBeLessThan(contextPos);
    });

    it("should preserve the output object identity across hooks (mutation, not replacement)", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Test fragment"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput({ system: "Initial." });

      // Store reference
      const outputRef = output;

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      // Same object reference must be maintained
      expect(output).toBe(outputRef);
      // Non-system fields must be untouched
      expect(output.temperature).toBe(0.7);
      expect(output.topP).toBe(1);
    });

    it("should handle missing fragments gracefully while other hooks still inject", async () => {
      writeFileSync(join(tmpDir, "README.md"), "# README present");
      setupLedgerFixture(tmpDir, "no-frags");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      // No fragments for commander
      const userConfig = { fragments: {} } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput();

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;

      expect(system).not.toContain("<user-instructions>");
      expect(system).toContain("<continuity-ledger");
      expect(system).toContain("<project-context>");
    });

    it("should handle missing ledger gracefully while other hooks still inject", async () => {
      writeFileSync(join(tmpDir, "CODE_STYLE.md"), "# Code Style\nUse camelCase.");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Fragment present"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput();

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;

      expect(system).toContain("Fragment present");
      expect(system).not.toContain("<continuity-ledger");
      expect(system).toContain("<project-context>");
      expect(system).toContain("Code Style");
    });

    it("should handle missing project context files while other hooks still inject", async () => {
      // No README.md, ARCHITECTURE.md, or CODE_STYLE.md
      setupLedgerFixture(tmpDir, "no-ctx");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Fragment for no-ctx test"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput();

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;

      expect(system).toContain("Fragment for no-ctx test");
      expect(system).toContain("<continuity-ledger");
      expect(system).not.toContain("<project-context>");
    });
  });

  describe("agent-scoped fragment injection in the chain", () => {
    it("should inject fragments only for the matching agent when chained with other hooks", async () => {
      writeFileSync(join(tmpDir, "README.md"), "# Project");
      setupLedgerFixture(tmpDir, "agent-scope");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          implementer: ["Implementer-only fragment"],
          commander: ["Commander fragment"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      // Request as commander agent
      const input = createMockChatParamsInput({ agent: "commander" });
      const output = createMockChatParamsOutput();

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;

      // Commander fragment present
      expect(system).toContain("Commander fragment");
      // Implementer fragment NOT present
      expect(system).not.toContain("Implementer-only fragment");
      // Other hooks still injected
      expect(system).toContain("<continuity-ledger");
      expect(system).toContain("<project-context>");
    });

    it("should skip fragment injection entirely for agents with no fragments", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          brainstormer: ["Brainstormer instruction"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);

      // Request as planner (no fragments configured)
      const input = createMockChatParamsInput({ agent: "planner" });
      const output = createMockChatParamsOutput({ system: "Planner base prompt." });

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);

      const system = output.system as string;

      expect(system).not.toContain("<user-instructions>");
      expect(system).not.toContain("Brainstormer instruction");
      expect(system).toContain("Planner base prompt.");
    });
  });

  describe("multiple context files in the chain", () => {
    it("should inject all available root context files when chained with other hooks", async () => {
      writeFileSync(join(tmpDir, "README.md"), "# README Content");
      writeFileSync(join(tmpDir, "ARCHITECTURE.md"), "# Architecture Content");
      writeFileSync(join(tmpDir, "CODE_STYLE.md"), "# Style Content");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Chain test fragment"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput();

      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;

      expect(system).toContain("README Content");
      expect(system).toContain("Architecture Content");
      expect(system).toContain("Style Content");
      expect(system).toContain("Chain test fragment");
    });
  });
});
