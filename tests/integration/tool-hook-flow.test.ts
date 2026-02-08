// tests/integration/tool-hook-flow.test.ts
//
// Integration tests for tool output flowing through artifact-auto-index
// and file-ops-tracker hooks. Validates that:
//  1. Ledger artifacts written via the Write tool are parsed and indexed in SQLite FTS5
//  2. Plan artifacts are similarly indexed and searchable
//  3. File operations (read/write/edit) are tracked in session state
//  4. Both hooks can process the same tool output in sequence

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseLedger } from "../../src/hooks/artifact-auto-index";
import {
  clearFileOps,
  createFileOpsTrackerHook,
  formatFileOpsForPrompt,
  getAndClearFileOps,
  getFileOps,
  trackFileOp,
} from "../../src/hooks/file-ops-tracker";
import { ArtifactIndex } from "../../src/tools/artifact-index";
import { createMockPluginCtx, createMockToolInput, createMockToolOutput } from "../helpers/mock-context";

describe("Integration: Tool-Hook Flow", () => {
  let tmpDir: string;
  let dbDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "int-tool-hook-"));
    dbDir = join(tmpDir, "artifact-db");
    mkdirSync(dbDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("artifact-auto-index: ledger parsing and FTS5 indexing", () => {
    it("should parse a realistic ledger and index it for full-text search", async () => {
      const ledgerContent = `# Session: auth-implementation

## Goal
Implement JWT-based authentication middleware for the API gateway.

## Progress
### Done
- [x] Created auth middleware skeleton
- [x] Added JWT token validation logic
- [x] Configured token expiry to 1 hour

### In Progress
- [ ] Adding refresh token rotation endpoint

## Key Decisions
- **JWT over sessions**: Stateless auth scales better for API-first architecture
- **RS256 signing**: Asymmetric keys allow token verification without sharing secrets

## Next Steps
1. Implement refresh token endpoint
2. Add token rotation on each use
3. Write integration tests for auth flow

## File Operations
### Read
- \`src/middleware/auth.ts\`
- \`src/config/jwt.ts\`

### Modified
- \`src/routes/auth.ts\`
- \`src/middleware/auth.ts\`
`;

      const filePath = join(tmpDir, "thoughts/ledgers/CONTINUITY_auth-implementation.md");
      mkdirSync(join(tmpDir, "thoughts/ledgers"), { recursive: true });
      writeFileSync(filePath, ledgerContent);

      // Step 1: Parse the ledger (same as artifact-auto-index hook does)
      const record = parseLedger(ledgerContent, filePath, "auth-implementation");

      expect(record.id).toBe("ledger-auth-implementation");
      expect(record.sessionName).toBe("auth-implementation");
      expect(record.goal).toBe("Implement JWT-based authentication middleware for the API gateway.");
      expect(record.stateNow).toBe("Adding refresh token rotation endpoint");
      expect(record.keyDecisions).toContain("JWT over sessions");
      expect(record.keyDecisions).toContain("RS256 signing");
      expect(record.filesRead).toContain("src/middleware/auth.ts");
      expect(record.filesModified).toContain("src/routes/auth.ts");

      // Step 2: Index into SQLite FTS5
      const index = new ArtifactIndex(dbDir);
      await index.initialize();

      try {
        await index.indexLedger(record);

        // Step 3: Verify searchable via FTS5
        const results = await index.search("JWT authentication");
        expect(results.length).toBeGreaterThan(0);

        const match = results.find((r) => r.id === "ledger-auth-implementation");
        expect(match).toBeDefined();
        expect(match!.type).toBe("ledger");
        expect(match!.filePath).toBe(filePath);
      } finally {
        await index.close();
      }
    });

    it("should support upsert behavior when re-indexing the same ledger", async () => {
      const filePath = join(tmpDir, "thoughts/ledgers/CONTINUITY_upsert-test.md");
      mkdirSync(join(tmpDir, "thoughts/ledgers"), { recursive: true });

      // Index v1
      const v1Content = `# Session: upsert-test\n\n## Goal\nFirst version of goal.\n`;
      writeFileSync(filePath, v1Content);
      const v1Record = parseLedger(v1Content, filePath, "upsert-test");

      const index = new ArtifactIndex(dbDir);
      await index.initialize();

      try {
        await index.indexLedger(v1Record);

        // Index v2 (same file path, different content)
        const v2Content = `# Session: upsert-test\n\n## Goal\nUpdated goal with new requirements.\n`;
        writeFileSync(filePath, v2Content);
        const v2Record = parseLedger(v2Content, filePath, "upsert-test");
        await index.indexLedger(v2Record);

        // Search should find the updated version
        const results = await index.search("updated requirements");
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe("ledger-upsert-test");
      } finally {
        await index.close();
      }
    });
  });

  describe("artifact-auto-index: plan parsing and FTS5 indexing", () => {
    it("should index a plan and make it searchable via FTS5", async () => {
      const planContent = `# Implement OAuth2 Flow

## Overview

Add OAuth2 authorization code flow with PKCE support for third-party integrations.

## Approach

1. Create an OAuth2 client registration endpoint
2. Implement authorization code generation with PKCE challenge
3. Build token exchange endpoint
4. Add token refresh with rotation
`;

      const filePath = join(tmpDir, "thoughts/shared/plans/oauth2-flow.md");
      mkdirSync(join(tmpDir, "thoughts/shared/plans"), { recursive: true });
      writeFileSync(filePath, planContent);

      const index = new ArtifactIndex(dbDir);
      await index.initialize();

      try {
        await index.indexPlan({
          id: "plan-oauth2-flow",
          title: "Implement OAuth2 Flow",
          filePath,
          overview: "Add OAuth2 authorization code flow with PKCE support for third-party integrations.",
          approach: "Create client registration, auth code with PKCE, token exchange, refresh rotation.",
        });

        // Search by content
        const results = await index.search("OAuth2 PKCE authorization");
        expect(results.length).toBeGreaterThan(0);

        const match = results.find((r) => r.id === "plan-oauth2-flow");
        expect(match).toBeDefined();
        expect(match!.type).toBe("plan");
        expect(match!.title).toBe("Implement OAuth2 Flow");
      } finally {
        await index.close();
      }
    });
  });

  describe("file-ops-tracker: tracking tool operations in session state", () => {
    it("should track read, write, and edit operations on separate sets", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir }) as any;
      const hook = createFileOpsTrackerHook(ctx);
      const sessionID = "int-fileops-session";
      clearFileOps(sessionID);

      // Simulate: Read src/auth.ts, Write src/routes.ts, Edit src/model.ts
      await hook["tool.execute.after"](
        createMockToolInput("read", { filePath: "/src/auth.ts" }, { sessionID }),
        createMockToolOutput("read", "content"),
      );
      await hook["tool.execute.after"](
        createMockToolInput("write", { filePath: "/src/routes.ts" }, { sessionID }),
        createMockToolOutput("write", "written"),
      );
      await hook["tool.execute.after"](
        createMockToolInput("edit", { filePath: "/src/model.ts" }, { sessionID }),
        createMockToolOutput("edit", "edited"),
      );

      const ops = getFileOps(sessionID);

      expect(ops.read.size).toBe(1);
      expect(ops.read.has("/src/auth.ts")).toBe(true);
      expect(ops.modified.size).toBe(2);
      expect(ops.modified.has("/src/routes.ts")).toBe(true);
      expect(ops.modified.has("/src/model.ts")).toBe(true);

      clearFileOps(sessionID);
    });

    it("should deduplicate repeated file operations within a session", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir }) as any;
      const hook = createFileOpsTrackerHook(ctx);
      const sessionID = "int-dedup-session";
      clearFileOps(sessionID);

      // Read the same file twice
      await hook["tool.execute.after"](
        createMockToolInput("read", { filePath: "/src/config.ts" }, { sessionID }),
        createMockToolOutput("read", "content v1"),
      );
      await hook["tool.execute.after"](
        createMockToolInput("read", { filePath: "/src/config.ts" }, { sessionID }),
        createMockToolOutput("read", "content v2"),
      );

      const ops = getFileOps(sessionID);
      expect(ops.read.size).toBe(1);

      clearFileOps(sessionID);
    });

    it("should not track non-file tools (Bash, Glob, etc.)", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir }) as any;
      const hook = createFileOpsTrackerHook(ctx);
      const sessionID = "int-skip-tools";
      clearFileOps(sessionID);

      await hook["tool.execute.after"](
        createMockToolInput("Bash", { command: "ls -la" }, { sessionID }),
        createMockToolOutput("Bash", "output"),
      );
      await hook["tool.execute.after"](
        createMockToolInput("Glob", { pattern: "**/*.ts" }, { sessionID }),
        createMockToolOutput("Glob", "files"),
      );

      const ops = getFileOps(sessionID);
      expect(ops.read.size).toBe(0);
      expect(ops.modified.size).toBe(0);

      clearFileOps(sessionID);
    });

    it("should isolate file operations between different sessions", async () => {
      const sessionA = "int-session-a";
      const sessionB = "int-session-b";
      clearFileOps(sessionA);
      clearFileOps(sessionB);

      trackFileOp(sessionA, "read", "/src/a.ts");
      trackFileOp(sessionB, "write", "/src/b.ts");
      trackFileOp(sessionA, "edit", "/src/c.ts");

      const opsA = getFileOps(sessionA);
      const opsB = getFileOps(sessionB);

      expect(opsA.read.has("/src/a.ts")).toBe(true);
      expect(opsA.modified.has("/src/c.ts")).toBe(true);
      expect(opsA.read.has("/src/b.ts")).toBe(false);
      expect(opsA.modified.has("/src/b.ts")).toBe(false);

      expect(opsB.modified.has("/src/b.ts")).toBe(true);
      expect(opsB.read.size).toBe(0);

      clearFileOps(sessionA);
      clearFileOps(sessionB);
    });

    it("should format file operations for prompt injection with sorted paths", () => {
      const sessionID = "int-format-session";
      clearFileOps(sessionID);

      trackFileOp(sessionID, "read", "/src/z-last.ts");
      trackFileOp(sessionID, "read", "/src/a-first.ts");
      trackFileOp(sessionID, "write", "/src/m-middle.ts");

      const ops = getFileOps(sessionID);
      const formatted = formatFileOpsForPrompt(ops);

      expect(formatted).toContain("<file-operations>");
      expect(formatted).toContain("</file-operations>");
      // Sorted: a-first before z-last
      const readIndex = formatted.indexOf("/src/a-first.ts");
      const readIndex2 = formatted.indexOf("/src/z-last.ts");
      expect(readIndex).toBeLessThan(readIndex2);
      expect(formatted).toContain("/src/m-middle.ts");

      clearFileOps(sessionID);
    });

    it("should clear session state via getAndClearFileOps returning copies", () => {
      const sessionID = "int-clear-session";
      clearFileOps(sessionID);

      trackFileOp(sessionID, "read", "/src/file.ts");
      trackFileOp(sessionID, "write", "/src/output.ts");

      const result = getAndClearFileOps(sessionID);

      // Returned copies have the data
      expect(result.read.has("/src/file.ts")).toBe(true);
      expect(result.modified.has("/src/output.ts")).toBe(true);

      // Original session state is cleared
      const afterClear = getFileOps(sessionID);
      expect(afterClear.read.size).toBe(0);
      expect(afterClear.modified.size).toBe(0);
    });
  });

  describe("combined flow: both hooks processing the same tool output", () => {
    it("should track file ops and index artifacts when processing the same Write tool output", async () => {
      // Setup ledger file on disk (artifact-auto-index reads it via readFileSync)
      const ledgerPath = join(tmpDir, "thoughts/ledgers/CONTINUITY_combined-test.md");
      mkdirSync(join(tmpDir, "thoughts/ledgers"), { recursive: true });
      writeFileSync(
        ledgerPath,
        `# Session: combined-test

## Goal
Test the combined hook flow.

## Progress
### In Progress
- [ ] Verifying combined flow

## Key Decisions
- **Integration testing**: Both hooks must work together
`,
      );

      const ctx = createMockPluginCtx({ directory: tmpDir }) as any;
      const fileOpsHook = createFileOpsTrackerHook(ctx);
      const sessionID = "int-combined-session";
      clearFileOps(sessionID);

      // Simulate a Write tool output for a ledger file
      const toolInput = createMockToolInput("write", { filePath: ledgerPath }, { sessionID });
      const toolOutput = createMockToolOutput("write", "Ledger written successfully");

      // Run file-ops-tracker hook
      await fileOpsHook["tool.execute.after"](toolInput, toolOutput);

      // Verify file ops tracked
      const ops = getFileOps(sessionID);
      expect(ops.modified.has(ledgerPath)).toBe(true);

      // Now simulate what artifact-auto-index does: parse + index
      const record = parseLedger(await Bun.file(ledgerPath).text(), ledgerPath, "combined-test");

      const index = new ArtifactIndex(dbDir);
      await index.initialize();

      try {
        await index.indexLedger(record);

        // Verify searchable
        const results = await index.search("combined hook flow");
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe("ledger-combined-test");
      } finally {
        await index.close();
      }

      clearFileOps(sessionID);
    });

    it("should handle session deletion cleaning up file ops state", async () => {
      const ctx = createMockPluginCtx({ directory: tmpDir }) as any;
      const fileOpsHook = createFileOpsTrackerHook(ctx);
      const sessionID = "int-cleanup-session";
      clearFileOps(sessionID);

      // Track some operations
      await fileOpsHook["tool.execute.after"](
        createMockToolInput("read", { filePath: "/src/cleanup.ts" }, { sessionID }),
        createMockToolOutput("read", "content"),
      );
      await fileOpsHook["tool.execute.after"](
        createMockToolInput("write", { filePath: "/src/output.ts" }, { sessionID }),
        createMockToolOutput("write", "written"),
      );

      // Verify operations were tracked
      const opsBefore = getFileOps(sessionID);
      expect(opsBefore.read.size).toBe(1);
      expect(opsBefore.modified.size).toBe(1);

      // Simulate session deletion event
      await fileOpsHook.event({
        event: {
          type: "session.deleted",
          properties: { info: { id: sessionID } },
        },
      });

      // State should be cleared
      const opsAfter = getFileOps(sessionID);
      expect(opsAfter.read.size).toBe(0);
      expect(opsAfter.modified.size).toBe(0);
    });
  });
});
