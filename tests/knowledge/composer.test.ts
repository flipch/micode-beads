import { describe, expect, it } from "bun:test";

import { composePrompt } from "../../src/knowledge/composer";
import { createFragmentRegistry } from "../../src/knowledge/registry";
import type { AgentKnowledgeDef, KnowledgeFragment } from "../../src/knowledge/types";

function makeFragment(name: string, content: string): KnowledgeFragment {
  return {
    name,
    category: "rules",
    description: `Fragment: ${name}`,
    content,
  };
}

describe("composePrompt", () => {
  it("should compose fragments in the order specified by the definition", () => {
    const registry = createFragmentRegistry([
      makeFragment("first", "Section A"),
      makeFragment("second", "Section B"),
      makeFragment("third", "Section C"),
    ]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: ["first", "second", "third"],
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("Section A\n\nSection B\n\nSection C");
  });

  it("should respect fragment ordering regardless of registry insertion order", () => {
    const registry = createFragmentRegistry([
      makeFragment("third", "C"),
      makeFragment("first", "A"),
      makeFragment("second", "B"),
    ]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: ["second", "third", "first"],
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("B\n\nC\n\nA");
  });

  it("should append inlineContent after all fragments", () => {
    const registry = createFragmentRegistry([makeFragment("frag", "Fragment content")]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: ["frag"],
      inlineContent: "Inline agent-specific content",
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("Fragment content\n\nInline agent-specific content");
  });

  it("should handle definition with only inlineContent and no fragments", () => {
    const registry = createFragmentRegistry([]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: [],
      inlineContent: "Only inline content",
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("Only inline content");
  });

  it("should return empty string for empty fragments and no inlineContent", () => {
    const registry = createFragmentRegistry([]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: [],
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("");
  });

  it("should throw when referencing a fragment not in the registry", () => {
    const registry = createFragmentRegistry([makeFragment("exists", "content")]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: ["exists", "missing"],
    };

    expect(() => composePrompt(def, registry)).toThrow('Fragment not found: "missing"');
  });

  it("should handle single fragment composition", () => {
    const registry = createFragmentRegistry([makeFragment("only-one", "The only content")]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: ["only-one"],
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("The only content");
  });

  it("should preserve fragment content exactly without trimming", () => {
    const registry = createFragmentRegistry([
      makeFragment("spaced", "  leading and trailing spaces  "),
      makeFragment("newlined", "\nhas\nnewlines\n"),
    ]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: ["spaced", "newlined"],
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("  leading and trailing spaces  \n\n\nhas\nnewlines\n");
  });

  it("should not include inlineContent when it is undefined", () => {
    const registry = createFragmentRegistry([makeFragment("a", "AAA"), makeFragment("b", "BBB")]);

    const def: AgentKnowledgeDef = {
      agent: "test-agent",
      fragments: ["a", "b"],
      inlineContent: undefined,
    };

    const result = composePrompt(def, registry);
    expect(result).toBe("AAA\n\nBBB");
  });
});
