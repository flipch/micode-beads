import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { WorkflowManager } from "../../src/workflow/manager";

describe("WorkflowManager.detectAfkMode", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.MICODE_AFK;
    delete process.env.MICODE_AFK;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.MICODE_AFK = originalEnv;
    } else {
      delete process.env.MICODE_AFK;
    }
  });

  it("should detect --afk from command arguments", () => {
    expect(WorkflowManager.detectAfkMode("build --afk", null)).toBe(true);
  });

  it("should detect --afk when combined with other flags", () => {
    expect(WorkflowManager.detectAfkMode("build --afk --git-pr", null)).toBe(true);
  });

  it("should detect MICODE_AFK=1 from environment variable", () => {
    process.env.MICODE_AFK = "1";

    expect(WorkflowManager.detectAfkMode("", null)).toBe(true);
  });

  it("should detect MICODE_AFK=true from environment variable", () => {
    process.env.MICODE_AFK = "true";

    expect(WorkflowManager.detectAfkMode("", null)).toBe(true);
  });

  it("should not detect AFK from MICODE_AFK=0", () => {
    process.env.MICODE_AFK = "0";

    expect(WorkflowManager.detectAfkMode("", null)).toBe(false);
  });

  it("should detect afk: true from config", () => {
    expect(WorkflowManager.detectAfkMode("", { afk: true })).toBe(true);
  });

  it("should not detect afk: false from config", () => {
    expect(WorkflowManager.detectAfkMode("", { afk: false })).toBe(false);
  });

  it("should return false when no AFK indicators are present", () => {
    expect(WorkflowManager.detectAfkMode("build my-feature", null)).toBe(false);
  });

  it("should prioritize args over env (args wins)", () => {
    process.env.MICODE_AFK = "0";

    expect(WorkflowManager.detectAfkMode("build --afk", null)).toBe(true);
  });

  it("should prioritize env over config (env wins)", () => {
    process.env.MICODE_AFK = "1";

    expect(WorkflowManager.detectAfkMode("", { afk: false })).toBe(true);
  });

  it("should handle null config gracefully", () => {
    expect(WorkflowManager.detectAfkMode("", null)).toBe(false);
  });

  it("should handle config without afk field", () => {
    expect(WorkflowManager.detectAfkMode("", { agents: {} })).toBe(false);
  });
});
