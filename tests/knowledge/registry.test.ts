import { describe, expect, it } from "bun:test";

import { createFragmentRegistry, loadFragmentRegistry } from "../../src/knowledge/registry";
import type { KnowledgeFragment } from "../../src/knowledge/types";

function makeFragment(overrides: Partial<KnowledgeFragment> & { name: string }): KnowledgeFragment {
  return {
    category: "rules",
    description: `Description for ${overrides.name}`,
    content: `Content for ${overrides.name}`,
    ...overrides,
  };
}

describe("createFragmentRegistry", () => {
  it("should create a registry from an array of fragments", () => {
    const fragments = [
      makeFragment({ name: "frag-a", category: "identity" }),
      makeFragment({ name: "frag-b", category: "rules" }),
    ];

    const registry = createFragmentRegistry(fragments);
    expect(registry.names()).toHaveLength(2);
    expect(registry.has("frag-a")).toBe(true);
    expect(registry.has("frag-b")).toBe(true);
  });

  it("should create an empty registry from an empty array", () => {
    const registry = createFragmentRegistry([]);
    expect(registry.names()).toHaveLength(0);
  });

  it("should throw on duplicate fragment names", () => {
    const fragments = [makeFragment({ name: "duplicate" }), makeFragment({ name: "duplicate" })];

    expect(() => createFragmentRegistry(fragments)).toThrow('Duplicate fragment name: "duplicate"');
  });
});

describe("FragmentRegistry.get", () => {
  it("should return the fragment by name", () => {
    const fragment = makeFragment({ name: "my-fragment", content: "Hello world" });
    const registry = createFragmentRegistry([fragment]);

    const result = registry.get("my-fragment");
    expect(result.name).toBe("my-fragment");
    expect(result.content).toBe("Hello world");
  });

  it("should throw with descriptive error for missing fragment", () => {
    const registry = createFragmentRegistry([
      makeFragment({ name: "existing-a" }),
      makeFragment({ name: "existing-b" }),
    ]);

    expect(() => registry.get("nonexistent")).toThrow('Fragment not found: "nonexistent"');
    expect(() => registry.get("nonexistent")).toThrow("existing-a");
    expect(() => registry.get("nonexistent")).toThrow("existing-b");
  });
});

describe("FragmentRegistry.byCategory", () => {
  it("should return all fragments for a given category", () => {
    const fragments = [
      makeFragment({ name: "rule-1", category: "rules" }),
      makeFragment({ name: "rule-2", category: "rules" }),
      makeFragment({ name: "tool-1", category: "tools" }),
    ];

    const registry = createFragmentRegistry(fragments);

    const rules = registry.byCategory("rules");
    expect(rules).toHaveLength(2);
    expect(rules.map((f) => f.name)).toEqual(["rule-1", "rule-2"]);

    const tools = registry.byCategory("tools");
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("tool-1");
  });

  it("should return empty array for category with no fragments", () => {
    const registry = createFragmentRegistry([makeFragment({ name: "rule-1", category: "rules" })]);

    expect(registry.byCategory("environment")).toEqual([]);
  });
});

describe("FragmentRegistry.has", () => {
  it("should return true for existing fragments and false for missing", () => {
    const registry = createFragmentRegistry([makeFragment({ name: "exists" })]);

    expect(registry.has("exists")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });
});

describe("FragmentRegistry.names", () => {
  it("should return all fragment names", () => {
    const registry = createFragmentRegistry([
      makeFragment({ name: "alpha" }),
      makeFragment({ name: "beta" }),
      makeFragment({ name: "gamma" }),
    ]);

    const names = registry.names();
    expect(names).toHaveLength(3);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    expect(names).toContain("gamma");
  });
});

describe("FragmentRegistry.fragments", () => {
  it("should expose the internal map", () => {
    const fragments = [makeFragment({ name: "one" }), makeFragment({ name: "two" })];

    const registry = createFragmentRegistry(fragments);
    expect(registry.fragments).toBeInstanceOf(Map);
    expect(registry.fragments.size).toBe(2);
  });
});

describe("loadFragmentRegistry", () => {
  it("should create a registry identical to createFragmentRegistry", () => {
    const fragments = [
      makeFragment({ name: "a", category: "identity" }),
      makeFragment({ name: "b", category: "workflow" }),
    ];

    const registry = loadFragmentRegistry(fragments);
    expect(registry.names()).toHaveLength(2);
    expect(registry.get("a").category).toBe("identity");
    expect(registry.get("b").category).toBe("workflow");
  });
});
