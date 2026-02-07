import { describe, expect, test } from "bun:test";

import { agentKnowledgeDefs, agents } from "../../src/agents";
import { composePrompt, loadFragmentRegistry } from "../../src/knowledge";
import { allFragments } from "../../src/knowledge/fragments";

const registry = loadFragmentRegistry(allFragments);

describe("agent prompt migration", () => {
  const knowledgeDefMap = new Map(agentKnowledgeDefs.map((d) => [d.agent, d]));

  for (const def of agentKnowledgeDefs) {
    test(`${def.agent}: composed prompt matches original`, () => {
      const originalAgent = agents[def.agent];
      expect(originalAgent).toBeDefined();
      expect(originalAgent.prompt).toBeDefined();

      const composed = composePrompt(def, registry);
      expect(composed).toBe(originalAgent.prompt);
    });
  }

  test("all non-mindmodel agents have knowledge definitions", () => {
    const mindmodelPrefixes = ["mm-"];
    const nonMindmodelAgents = Object.keys(agents).filter(
      (name) => !mindmodelPrefixes.some((prefix) => name.startsWith(prefix)),
    );

    for (const agentName of nonMindmodelAgents) {
      expect(knowledgeDefMap.has(agentName)).toBe(true);
    }
  });

  test("no mindmodel agents have knowledge definitions", () => {
    for (const def of agentKnowledgeDefs) {
      expect(def.agent.startsWith("mm-")).toBe(false);
    }
  });

  test("fragment registry contains all expected fragments", () => {
    expect(registry.names().length).toBe(allFragments.length);
    expect(registry.names().length).toBe(19);
  });

  test("all fragment names referenced by agents exist in registry", () => {
    for (const def of agentKnowledgeDefs) {
      for (const fragmentName of def.fragments) {
        expect(registry.has(fragmentName)).toBe(true);
      }
    }
  });

  test("commander and brainstormer share the primary-agent-env fragment", () => {
    const commanderDef = knowledgeDefMap.get("commander");
    const brainstormerDef = knowledgeDefMap.get("brainstormer");

    expect(commanderDef).toBeDefined();
    expect(brainstormerDef).toBeDefined();
    expect(commanderDef!.fragments).toContain("primary-agent-env");
    expect(brainstormerDef!.fragments).toContain("primary-agent-env");
  });

  test("fragment loading completes in under 100ms", () => {
    const start = performance.now();
    loadFragmentRegistry(allFragments);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
