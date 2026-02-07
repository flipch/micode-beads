import { describe, expect, it } from "bun:test";

import { createFragmentRegistry } from "../../src/knowledge/registry";
import type { AgentKnowledgeDef, KnowledgeFragment } from "../../src/knowledge/types";
import { validateFragments } from "../../src/knowledge/validator";

function makeFragment(overrides: Partial<KnowledgeFragment> & { name: string }): KnowledgeFragment {
  return {
    category: "rules",
    description: `Description for ${overrides.name}`,
    content: `Content for ${overrides.name}`,
    ...overrides,
  };
}

function makeDef(agent: string, fragments: string[]): AgentKnowledgeDef {
  return { agent, fragments };
}

describe("validateFragments", () => {
  it("should return valid for matching fragments and definitions", () => {
    const registry = createFragmentRegistry([makeFragment({ name: "frag-a" }), makeFragment({ name: "frag-b" })]);

    const defs = [makeDef("agent-1", ["frag-a"]), makeDef("agent-2", ["frag-b"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should detect missing fragments", () => {
    const registry = createFragmentRegistry([makeFragment({ name: "exists" })]);

    const defs = [makeDef("my-agent", ["exists", "missing-one", "missing-two"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(false);

    const missingErrors = result.errors.filter((e) => e.type === "missing-fragment");
    expect(missingErrors).toHaveLength(2);
    expect(missingErrors[0].agent).toBe("my-agent");
    expect(missingErrors[0].fragment).toBe("missing-one");
    expect(missingErrors[1].fragment).toBe("missing-two");
  });

  it("should detect orphaned fragments as warnings", () => {
    const registry = createFragmentRegistry([
      makeFragment({ name: "used" }),
      makeFragment({ name: "orphan-1" }),
      makeFragment({ name: "orphan-2" }),
    ]);

    const defs = [makeDef("agent-1", ["used"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(true);

    const orphanWarnings = result.warnings.filter((w) => w.type === "orphaned-fragment");
    expect(orphanWarnings).toHaveLength(2);
    expect(orphanWarnings.map((w) => w.fragment)).toContain("orphan-1");
    expect(orphanWarnings.map((w) => w.fragment)).toContain("orphan-2");
  });

  it("should detect empty content as errors", () => {
    const registry = createFragmentRegistry([
      makeFragment({ name: "empty", content: "" }),
      makeFragment({ name: "whitespace", content: "   \n  " }),
    ]);

    const defs = [makeDef("agent-1", ["empty", "whitespace"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(false);

    const emptyErrors = result.errors.filter((e) => e.type === "empty-content");
    expect(emptyErrors).toHaveLength(2);
    expect(emptyErrors.map((e) => e.fragment)).toContain("empty");
    expect(emptyErrors.map((e) => e.fragment)).toContain("whitespace");
  });

  it("should detect duplicate references within an agent as warnings", () => {
    const registry = createFragmentRegistry([makeFragment({ name: "frag-a" })]);

    const defs = [makeDef("agent-1", ["frag-a", "frag-a"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(true);

    const dupWarnings = result.warnings.filter((w) => w.type === "duplicate-reference");
    expect(dupWarnings).toHaveLength(1);
    expect(dupWarnings[0].agent).toBe("agent-1");
    expect(dupWarnings[0].fragment).toBe("frag-a");
  });

  it("should handle empty registry and empty definitions", () => {
    const registry = createFragmentRegistry([]);
    const result = validateFragments(registry, []);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should handle multiple agents referencing the same fragment", () => {
    const registry = createFragmentRegistry([makeFragment({ name: "shared" })]);

    const defs = [makeDef("agent-1", ["shared"]), makeDef("agent-2", ["shared"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("should combine multiple error types in a single result", () => {
    const registry = createFragmentRegistry([
      makeFragment({ name: "used-valid" }),
      makeFragment({ name: "orphan" }),
      makeFragment({ name: "empty", content: "" }),
    ]);

    const defs = [makeDef("agent-1", ["used-valid", "nonexistent", "empty"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(false);

    expect(result.errors.some((e) => e.type === "missing-fragment")).toBe(true);
    expect(result.errors.some((e) => e.type === "empty-content")).toBe(true);
    expect(result.warnings.some((w) => w.type === "orphaned-fragment")).toBe(true);
  });

  it("should report all valid categories as passing", () => {
    const registry = createFragmentRegistry([
      makeFragment({ name: "id", category: "identity" }),
      makeFragment({ name: "ru", category: "rules" }),
      makeFragment({ name: "wf", category: "workflow" }),
      makeFragment({ name: "tl", category: "tools" }),
      makeFragment({ name: "cn", category: "constraints" }),
      makeFragment({ name: "en", category: "environment" }),
      makeFragment({ name: "ig", category: "integration" }),
    ]);

    const defs = [makeDef("agent-1", ["id", "ru", "wf", "tl", "cn", "en", "ig"])];

    const result = validateFragments(registry, defs);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
