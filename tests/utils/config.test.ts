// tests/utils/config.test.ts
import { describe, expect, it } from "bun:test";

describe("config utility", () => {
  describe("config.compaction", () => {
    it("should have threshold", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.compaction.threshold).toBe(0.7);
    });

    it("should have cooldownMs", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.compaction.cooldownMs).toBe(120_000);
    });

    it("should have timeoutMs", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.compaction.timeoutMs).toBe(120_000);
    });
  });

  describe("config.contextWindow", () => {
    it("should have warningThreshold less than criticalThreshold", async () => {
      // Guards against: thresholds being swapped or equal, which would break progressive warnings
      const { config } = await import("../../src/utils/config");
      expect(config.contextWindow.warningThreshold).toBe(0.7);
      expect(config.contextWindow.criticalThreshold).toBe(0.85);
      expect(config.contextWindow.warningThreshold).toBeLessThan(config.contextWindow.criticalThreshold);
      expect(config.contextWindow.warningThreshold).toBeGreaterThan(0);
      expect(config.contextWindow.criticalThreshold).toBeLessThanOrEqual(1);
    });

    it("should have warningCooldownMs as a positive number", async () => {
      // Guards against: cooldown being zero or negative, which would cause constant warning spam
      const { config } = await import("../../src/utils/config");
      expect(config.contextWindow.warningCooldownMs).toBe(120_000);
      expect(config.contextWindow.warningCooldownMs).toBeGreaterThan(0);
    });
  });

  describe("config.tokens", () => {
    it("should have charsPerToken", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.tokens.charsPerToken).toBe(4);
    });

    it("should have defaultContextLimit", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.tokens.defaultContextLimit).toBe(200_000);
    });

    it("should have defaultMaxOutputTokens", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.tokens.defaultMaxOutputTokens).toBe(50_000);
    });

    it("should have safetyMargin", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.tokens.safetyMargin).toBe(0.5);
    });

    it("should have preserveHeaderLines", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.tokens.preserveHeaderLines).toBe(3);
    });
  });

  describe("config.paths", () => {
    it("should have ledgerDir", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.paths.ledgerDir).toBe("thoughts/ledgers");
    });

    it("should have ledgerPrefix", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.paths.ledgerPrefix).toBe("CONTINUITY_");
    });

    it("should have rootContextFiles", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.paths.rootContextFiles).toEqual(["README.md", "ARCHITECTURE.md", "CODE_STYLE.md"]);
    });

    it("should have dirContextFiles", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.paths.dirContextFiles).toEqual(["README.md"]);
    });

    it("should have planPattern regex matching correct paths and rejecting others", async () => {
      // Guards against: planPattern regex becoming too broad or too narrow
      const { config } = await import("../../src/utils/config");
      expect(config.paths.planPattern.test("thoughts/shared/plans/2026-01-01-test.md")).toBe(true);
      expect(config.paths.planPattern.test("thoughts/shared/plans/my-plan.md")).toBe(true);
      expect(config.paths.planPattern.test("other/path.md")).toBe(false);
      expect(config.paths.planPattern.test("thoughts/ledgers/CONTINUITY_abc.md")).toBe(false);
      expect(config.paths.planPattern instanceof RegExp).toBe(true);
    });

    it("should have ledgerPattern regex matching CONTINUITY_ prefix ledger paths", async () => {
      // Guards against: ledgerPattern failing to match valid ledger filenames or matching non-ledger paths
      const { config } = await import("../../src/utils/config");
      expect(config.paths.ledgerPattern.test("thoughts/ledgers/CONTINUITY_abc123.md")).toBe(true);
      expect(config.paths.ledgerPattern.test("thoughts/ledgers/CONTINUITY_my-session.md")).toBe(true);
      expect(config.paths.ledgerPattern.test("other/path.md")).toBe(false);
      expect(config.paths.ledgerPattern.test("thoughts/shared/plans/plan.md")).toBe(false);
      expect(config.paths.ledgerPattern instanceof RegExp).toBe(true);
    });
  });

  describe("config.timeouts", () => {
    it("should have btcaMs", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.timeouts.btcaMs).toBe(120_000);
    });

    it("should have toastSuccessMs", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.timeouts.toastSuccessMs).toBe(3000);
    });

    it("should have toastWarningMs", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.timeouts.toastWarningMs).toBe(4000);
    });

    it("should have toastErrorMs", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.timeouts.toastErrorMs).toBe(5000);
    });
  });

  describe("config.limits", () => {
    it("should have largeFileBytes", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.largeFileBytes).toBe(100 * 1024);
    });

    it("should have maxLinesNoExtract", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.maxLinesNoExtract).toBe(200);
    });

    it("should have ptyMaxBufferLines", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.ptyMaxBufferLines).toBe(50_000);
    });

    it("should have ptyDefaultReadLimit", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.ptyDefaultReadLimit).toBe(500);
    });

    it("should have ptyMaxLineLength", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.ptyMaxLineLength).toBe(2000);
    });

    it("should have astGrepMaxMatches", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.astGrepMaxMatches).toBe(100);
    });

    it("should have contextCacheTtlMs", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.contextCacheTtlMs).toBe(30_000);
    });

    it("should have contextCacheMaxSize", async () => {
      const { config } = await import("../../src/utils/config");
      expect(config.limits.contextCacheMaxSize).toBe(100);
    });
  });
});
