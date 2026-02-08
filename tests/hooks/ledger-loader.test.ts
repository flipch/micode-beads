// tests/hooks/ledger-loader.test.ts
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ledger-loader", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `ledger-test-${Date.now()}`);
    mkdirSync(join(testDir, "thoughts", "ledgers"), { recursive: true });
  });

  it("should find ledger files in thoughts/ledgers/", async () => {
    // Guards against: ledger loader failing to parse session name or losing content/path from result
    const ledgerContent = "# Session: test-session\n\n## Goal\nTest goal";
    const ledgerPath = join(testDir, "thoughts", "ledgers", "CONTINUITY_test-session.md");
    writeFileSync(ledgerPath, ledgerContent);

    const { findCurrentLedger } = await import("../../src/hooks/ledger-loader");
    const result = await findCurrentLedger(testDir);

    expect(result).not.toBeNull();
    expect(result?.sessionName).toBe("test-session");
    expect(result?.content).toBe(ledgerContent);
    expect(result?.filePath).toBe(ledgerPath);
  });

  it("should return null when no ledger exists", async () => {
    // Guards against: ledger loader returning stale data or incorrect type for empty directory
    const { findCurrentLedger } = await import("../../src/hooks/ledger-loader");
    const result = await findCurrentLedger(testDir);

    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
});
