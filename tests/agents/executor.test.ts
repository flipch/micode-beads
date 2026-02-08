import { describe, expect, it } from "bun:test";

import { executorAgent } from "../../src/agents/executor";

describe("executor agent", () => {
  it("should use spawn_agent tool for subagents", async () => {
    // Guards against: executor losing spawn_agent instructions or agent references
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/agents/executor.ts", "utf-8");

    expect(source).toContain("spawn_agent tool");
    expect(source).toContain('agent="implementer"');
    expect(source).toContain('agent="reviewer"');

    expect(executorAgent.prompt).toContain("spawn_agent");
    expect(executorAgent.prompt).toContain("implementer");
    expect(executorAgent.prompt).toContain("reviewer");
  });

  it("should be configured as a subagent with correct properties", () => {
    // Guards against: executor mode or temperature changing from expected values
    expect(executorAgent.mode).toBe("subagent");
    expect(executorAgent.temperature).toBe(0.2);
    expect(typeof executorAgent.description).toBe("string");
    expect(executorAgent.description).toContain("parallel");
  });

  it("should instruct batch-first parallel execution strategy in prompt", () => {
    // Guards against: executor losing its core batch-parallel execution strategy
    expect(executorAgent.prompt).toContain("parallel");
    expect(executorAgent.prompt).toContain("batch");
    expect(executorAgent.prompt).toContain("BATCH-FIRST");
  });
});
