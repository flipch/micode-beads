import { describe, expect, it } from "bun:test";

import { plannerAgent } from "../../src/agents/planner";

describe("planner agent", () => {
  it("should use spawn_agent tool for subagent research", async () => {
    // Guards against: planner losing spawn_agent or codebase-locator references
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/agents/planner.ts", "utf-8");

    expect(source).toContain("spawn_agent tool");
    expect(source).toContain('agent="codebase-locator"');

    expect(plannerAgent.prompt).toContain("spawn_agent");
    expect(plannerAgent.prompt).toContain("codebase-locator");
  });

  it("should be configured as a subagent with correct properties", () => {
    // Guards against: planner mode or temperature drifting from expected values
    expect(plannerAgent.mode).toBe("subagent");
    expect(plannerAgent.temperature).toBe(0.3);
    expect(typeof plannerAgent.description).toBe("string");
    expect(plannerAgent.description).toContain("micro-task");
    expect(plannerAgent.description).toContain("parallel");
  });

  it("should enforce synchronous spawn_agent usage in prompt", () => {
    // Guards against: planner losing synchronous spawn_agent instruction
    expect(plannerAgent.prompt).toContain("synchronously");
    expect(plannerAgent.prompt).toContain("parallel");
  });

  it("should reference library research tools in prompt", () => {
    // Guards against: planner losing context7 and btca_ask tool references
    expect(plannerAgent.prompt).toContain("context7");
    expect(plannerAgent.prompt).toContain("btca_ask");
  });
});
