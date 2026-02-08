import { describe, expect, it } from "bun:test";

describe("agents index", () => {
  it("should not export handoff agents and have expected agent count", async () => {
    // Guards against: re-introduction of removed handoff agents or accidental agent registry changes
    const module = await import("../../src/agents/index");

    expect(module.agents["handoff-creator"]).toBeUndefined();
    expect(module.agents["handoff-resumer"]).toBeUndefined();
    expect((module as Record<string, unknown>).handoffCreatorAgent).toBeUndefined();
    expect((module as Record<string, unknown>).handoffResumerAgent).toBeUndefined();

    const agentCount = Object.keys(module.agents).length;
    expect(agentCount).toBeGreaterThanOrEqual(25);
    expect(agentCount).toBeLessThanOrEqual(35);
  });

  it("should still export other agents with correct config shape", async () => {
    // Guards against: agents missing required config properties (mode, description, prompt, model)
    const module = await import("../../src/agents/index");

    const coreAgents = ["ledger-creator", "brainstormer", "commander"] as const;
    for (const name of coreAgents) {
      const agent = module.agents[name];
      expect(agent).toBeDefined();
      expect(typeof agent.description).toBe("string");
      expect(agent.description!.length).toBeGreaterThan(0);
      expect(agent.prompt).toBeDefined();
      expect(typeof agent.prompt).toBe("string");
      expect(agent.model).toBe("openai/gpt-5.2-codex");
    }
    expect(module.agents.commander.mode).toBe("primary");
    expect(module.agents.brainstormer.mode).toBe("primary");
    expect(module.agents["ledger-creator"].mode).toBe("subagent");
  });

  it("should register mindmodel v2 analysis agents", async () => {
    const module = await import("../../src/agents/index");

    // New v2 analysis agents
    expect(module.agents["mm-dependency-mapper"]).toBeDefined();
    expect(module.agents["mm-convention-extractor"]).toBeDefined();
    expect(module.agents["mm-domain-extractor"]).toBeDefined();
    expect(module.agents["mm-code-clusterer"]).toBeDefined();
    expect(module.agents["mm-anti-pattern-detector"]).toBeDefined();
    expect(module.agents["mm-constraint-writer"]).toBeDefined();
    expect(module.agents["mm-constraint-reviewer"]).toBeDefined();
  });

  it("should configure mindmodel v2 agents as subagents with valid config", async () => {
    // Guards against: mindmodel v2 agents losing subagent mode or having empty prompts/descriptions
    const module = await import("../../src/agents/index");

    const v2Agents = [
      "mm-dependency-mapper",
      "mm-convention-extractor",
      "mm-domain-extractor",
      "mm-code-clusterer",
      "mm-anti-pattern-detector",
      "mm-constraint-writer",
      "mm-constraint-reviewer",
    ];

    for (const agentName of v2Agents) {
      const agent = module.agents[agentName];
      expect(agent.mode).toBe("subagent");
      expect(agent.model).toBe("openai/gpt-5.2-codex");
      expect(typeof agent.description).toBe("string");
      expect(agent.description!.length).toBeGreaterThan(0);
      expect(typeof agent.prompt).toBe("string");
      expect(agent.prompt!.length).toBeGreaterThan(50);
    }
  });
});
