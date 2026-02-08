// tests/e2e/hook-pipeline-e2e.test.ts
//
// E2E tests for the hook pipeline exercising the same ordering
// and composition as src/index.ts. Tests both the chat.params
// pipeline (fragment injection, ledger loading, context injection)
// and the tool.execute.after pipeline (file ops tracking, comment
// checking, context injection).

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MicodeConfig } from "../../src/config-loader";
import { createCommentCheckerHook } from "../../src/hooks/comment-checker";
import { createContextInjectorHook } from "../../src/hooks/context-injector";
import { clearFileOps, createFileOpsTrackerHook, getFileOps } from "../../src/hooks/file-ops-tracker";
import { createFragmentInjectorHook } from "../../src/hooks/fragment-injector";
import { createLedgerLoaderHook } from "../../src/hooks/ledger-loader";
import {
  createMockChatParamsInput,
  createMockChatParamsOutput,
  createMockPluginCtx,
  createMockToolInput,
  createMockToolOutput,
  setupLedgerFixture,
} from "../helpers/mock-context";

describe("E2E: Hook Pipeline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "e2e-hooks-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("chat.params pipeline: fragment + ledger + context injection", () => {
    it("should inject fragments, ledger, and project context into system prompt in correct order", async () => {
      writeFileSync(join(tmpDir, "README.md"), "# Test Project\nA sample project for testing.");

      setupLedgerFixture(tmpDir, "test-session");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Always explain your reasoning", "Use TypeScript strict mode"],
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

      expect(output.system).toBeDefined();
      expect(typeof output.system).toBe("string");

      expect(output.system).toContain("<user-instructions>");
      expect(output.system).toContain("Always explain your reasoning");
      expect(output.system).toContain("Use TypeScript strict mode");

      expect(output.system).toContain("<continuity-ledger");
      expect(output.system).toContain("Implement the authentication module");

      expect(output.system).toContain("<project-context>");
      expect(output.system).toContain("Test Project");
    });

    it("should place ledger before fragments and fragments before context in the system prompt", async () => {
      // In the real pipeline (src/index.ts), fragments prepend first, then ledger prepends
      // second. Since ledger prepends *after* fragments, it ends up before fragments
      // in the final string. Context appends, so it comes last.
      // Final order: ledger -> fragments -> base system -> context
      writeFileSync(join(tmpDir, "README.md"), "# Project README");
      setupLedgerFixture(tmpDir, "order-test");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Fragment instruction"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput();

      // Run hooks in the same order as src/index.ts
      await fragmentHook["chat.params"](input, output);
      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      const system = output.system as string;
      const fragmentPos = system.indexOf("<user-instructions>");
      const ledgerPos = system.indexOf("<continuity-ledger");
      const contextPos = system.indexOf("<project-context>");

      expect(fragmentPos).toBeGreaterThanOrEqual(0);
      expect(ledgerPos).toBeGreaterThanOrEqual(0);
      expect(contextPos).toBeGreaterThanOrEqual(0);

      // Ledger prepends after fragments, so it appears first in the string
      expect(ledgerPos).toBeLessThan(fragmentPos);
      expect(fragmentPos).toBeLessThan(contextPos);
    });

    it("should handle missing ledger gracefully without affecting other injections", async () => {
      writeFileSync(join(tmpDir, "README.md"), "# Project");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Fragment text"],
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

      expect(output.system).toContain("Fragment text");
      expect(output.system).not.toContain("<continuity-ledger");
      expect(output.system).toContain("<project-context>");
    });

    it("should handle missing project context files gracefully", async () => {
      setupLedgerFixture(tmpDir, "no-readme-session");

      const ctx = createMockPluginCtx({ directory: tmpDir });

      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput();

      await ledgerHook["chat.params"](input, output);
      await contextHook["chat.params"](input, output);

      expect(output.system).toContain("<continuity-ledger");
      expect(output.system).not.toContain("<project-context>");
    });

    it("should only inject fragments for the matching agent", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          implementer: ["Fragment for implementer"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);

      const input = createMockChatParamsInput({ agent: "commander" });
      const output = createMockChatParamsOutput();

      await fragmentHook["chat.params"](input, output);

      expect(output.system).not.toContain("Fragment for implementer");
    });
  });

  describe("tool.execute.after pipeline: file ops + comment checker + context", () => {
    it("should track read operations through the file-ops-tracker hook", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const fileOpsHook = createFileOpsTrackerHook(ctx);

      const sessionID = "e2e-session-read";
      clearFileOps(sessionID);

      const input = createMockToolInput("read", { filePath: "/src/auth.ts" }, { sessionID });
      const output = createMockToolOutput("read", "file contents here");

      await fileOpsHook["tool.execute.after"](input, output);

      const ops = getFileOps(sessionID);
      expect(ops.read.has("/src/auth.ts")).toBe(true);
      expect(ops.modified.size).toBe(0);

      clearFileOps(sessionID);
    });

    it("should track write operations as modified files", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const fileOpsHook = createFileOpsTrackerHook(ctx);

      const sessionID = "e2e-session-write";
      clearFileOps(sessionID);

      const input = createMockToolInput("write", { filePath: "/src/routes.ts" }, { sessionID });
      const output = createMockToolOutput("write", "file written");

      await fileOpsHook["tool.execute.after"](input, output);

      const ops = getFileOps(sessionID);
      expect(ops.modified.has("/src/routes.ts")).toBe(true);
      expect(ops.read.size).toBe(0);

      clearFileOps(sessionID);
    });

    it("should track edit operations as modified files", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const fileOpsHook = createFileOpsTrackerHook(ctx);

      const sessionID = "e2e-session-edit";
      clearFileOps(sessionID);

      const input = createMockToolInput("edit", { filePath: "/src/model.ts" }, { sessionID });
      const output = createMockToolOutput("edit", "edit applied");

      await fileOpsHook["tool.execute.after"](input, output);

      const ops = getFileOps(sessionID);
      expect(ops.modified.has("/src/model.ts")).toBe(true);

      clearFileOps(sessionID);
    });

    it("should add comment warnings when edit tool produces excessive comments", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const commentHook = createCommentCheckerHook(ctx);

      const codeWithBadComments = [
        "// increment the counter",
        "counter++;",
        "// set the name",
        'name = "test";',
        "// return the result",
        "return result;",
      ].join("\n");

      const input = { tool: "Edit", args: { new_string: codeWithBadComments } };
      const output = { output: "Edit applied successfully" };

      await commentHook["tool.execute.after"](input, output);

      expect(output.output).toContain("Comment Check");
      expect(output.output).toContain("potentially unnecessary comment");
    });

    it("should not add comment warnings for clean code", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const commentHook = createCommentCheckerHook(ctx);

      const cleanCode = [
        "// TODO: Add proper error handling for edge cases",
        "const result = await fetchData();",
        "return result;",
      ].join("\n");

      const input = { tool: "Edit", args: { new_string: cleanCode } };
      const output = { output: "Edit applied successfully" };

      await commentHook["tool.execute.after"](input, output);

      expect(output.output).not.toContain("Comment Check");
    });

    it("should inject directory context when reading files within the project", async () => {
      const subDir = join(tmpDir, "src", "auth");
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, "README.md"), "# Auth Module\nHandles authentication.");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const contextHook = createContextInjectorHook(ctx);

      const filePath = join(subDir, "middleware.ts");
      const input = { tool: "Read", args: { filePath } };
      const output = { output: "export function authMiddleware() {}" };

      await contextHook["tool.execute.after"](input, output);

      expect(output.output).toContain("<directory-context>");
      expect(output.output).toContain("Auth Module");
    });

    it("should not inject directory context for non-file-access tools", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const contextHook = createContextInjectorHook(ctx);

      const input = { tool: "Bash", args: { command: "ls -la" } };
      const output = { output: "file1.ts file2.ts" };

      await contextHook["tool.execute.after"](input, output);

      expect(output.output).not.toContain("<directory-context>");
    });
  });

  describe("combined pipeline: multiple hooks modifying same output", () => {
    it("should chain chat.params hooks without clobbering previous mutations", async () => {
      writeFileSync(join(tmpDir, "README.md"), "# README Content");
      setupLedgerFixture(tmpDir, "combined-session");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const userConfig = {
        fragments: {
          commander: ["Custom instruction 1", "Custom instruction 2"],
        },
      } satisfies MicodeConfig;

      const fragmentHook = createFragmentInjectorHook(ctx, userConfig);
      const ledgerHook = createLedgerLoaderHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const input = createMockChatParamsInput();
      const output = createMockChatParamsOutput({ system: "Base system prompt." });

      await fragmentHook["chat.params"](input, output);

      const afterFragment = output.system as string;
      expect(afterFragment).toContain("Custom instruction 1");
      expect(afterFragment).toContain("Base system prompt.");

      await ledgerHook["chat.params"](input, output);

      const afterLedger = output.system as string;
      expect(afterLedger).toContain("Custom instruction 1");
      expect(afterLedger).toContain("<continuity-ledger");
      expect(afterLedger).toContain("Base system prompt.");

      await contextHook["chat.params"](input, output);

      const afterContext = output.system as string;
      expect(afterContext).toContain("Custom instruction 1");
      expect(afterContext).toContain("<continuity-ledger");
      expect(afterContext).toContain("<project-context>");
      expect(afterContext).toContain("README Content");
      expect(afterContext).toContain("Base system prompt.");
    });

    it("should chain tool.execute.after hooks without losing earlier mutations", async () => {
      const subDir = join(tmpDir, "src");
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, "README.md"), "# Source docs");

      const ctx = createMockPluginCtx({ directory: tmpDir });
      const fileOpsHook = createFileOpsTrackerHook(ctx);
      const contextHook = createContextInjectorHook(ctx);

      const sessionID = "e2e-combined-tool";
      clearFileOps(sessionID);

      const filePath = join(subDir, "module.ts");
      const input = { tool: "Read", sessionID, args: { filePath } };
      const output = { output: "module content" };

      await contextHook["tool.execute.after"](input, output);
      await fileOpsHook["tool.execute.after"](input, output);

      expect(output.output).toContain("module content");
      expect(output.output).toContain("<directory-context>");

      const ops = getFileOps(sessionID);
      expect(ops.read.has(filePath)).toBe(true);

      clearFileOps(sessionID);
    });

    it("should track multiple file operations within a single session", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const fileOpsHook = createFileOpsTrackerHook(ctx);

      const sessionID = "e2e-multi-ops";
      clearFileOps(sessionID);

      await fileOpsHook["tool.execute.after"](
        createMockToolInput("read", { filePath: "/src/a.ts" }, { sessionID }),
        createMockToolOutput("read", "a"),
      );
      await fileOpsHook["tool.execute.after"](
        createMockToolInput("read", { filePath: "/src/b.ts" }, { sessionID }),
        createMockToolOutput("read", "b"),
      );
      await fileOpsHook["tool.execute.after"](
        createMockToolInput("write", { filePath: "/src/c.ts" }, { sessionID }),
        createMockToolOutput("write", "c"),
      );
      await fileOpsHook["tool.execute.after"](
        createMockToolInput("edit", { filePath: "/src/a.ts" }, { sessionID }),
        createMockToolOutput("edit", "edited a"),
      );

      const ops = getFileOps(sessionID);
      expect(ops.read.size).toBe(2);
      expect(ops.read.has("/src/a.ts")).toBe(true);
      expect(ops.read.has("/src/b.ts")).toBe(true);
      expect(ops.modified.size).toBe(2);
      expect(ops.modified.has("/src/c.ts")).toBe(true);
      expect(ops.modified.has("/src/a.ts")).toBe(true);

      clearFileOps(sessionID);
    });

    it("should clean up file ops on session deletion event", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir });
      const fileOpsHook = createFileOpsTrackerHook(ctx);

      const sessionID = "e2e-cleanup";
      clearFileOps(sessionID);

      await fileOpsHook["tool.execute.after"](
        createMockToolInput("read", { filePath: "/src/file.ts" }, { sessionID }),
        createMockToolOutput("read", "content"),
      );

      expect(getFileOps(sessionID).read.size).toBe(1);

      await fileOpsHook.event({
        event: {
          type: "session.deleted",
          properties: { info: { id: sessionID } },
        },
      });

      expect(getFileOps(sessionID).read.size).toBe(0);
      expect(getFileOps(sessionID).modified.size).toBe(0);
    });
  });
});
