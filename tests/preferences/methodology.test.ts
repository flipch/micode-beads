import { describe, expect, it } from "bun:test";

import { BUILTIN_METHODOLOGIES, getActiveMethodology, getMethodology } from "../../src/preferences/methodology";

describe("BUILTIN_METHODOLOGIES", () => {
  it("contains default and tdd profiles", () => {
    expect(Object.keys(BUILTIN_METHODOLOGIES)).toEqual(["default", "tdd"]);
  });

  it("default profile has no test separation", () => {
    const def = BUILTIN_METHODOLOGIES.default;
    expect(def.name).toBe("default");
    expect(def.taskOrdering.separateTestTasks).toBe(false);
    expect(def.taskOrdering.testFirst).toBe(false);
    expect(def.promptModifiers.plannerInstructions).toBe("");
    expect(def.promptModifiers.executorInstructions).toBe("");
    expect(def.promptModifiers.implementerInstructions).toBe("");
  });

  it("tdd profile enforces test-first ordering", () => {
    const tdd = BUILTIN_METHODOLOGIES.tdd;
    expect(tdd.name).toBe("tdd");
    expect(tdd.taskOrdering.separateTestTasks).toBe(true);
    expect(tdd.taskOrdering.testFirst).toBe(true);
  });

  it("tdd profile has planner instructions with batch structure", () => {
    const instructions = BUILTIN_METHODOLOGIES.tdd.promptModifiers.plannerInstructions;
    expect(instructions).toContain("TDD");
    expect(instructions).toContain("TEST task");
    expect(instructions).toContain("IMPLEMENTATION task");
    expect(instructions).toContain("dependency graph");
  });

  it("tdd profile has executor instructions with phase verification", () => {
    const instructions = BUILTIN_METHODOLOGIES.tdd.promptModifiers.executorInstructions;
    expect(instructions).toContain("red phase");
    expect(instructions).toContain("green phase");
  });

  it("tdd profile has implementer instructions with task separation", () => {
    const instructions = BUILTIN_METHODOLOGIES.tdd.promptModifiers.implementerInstructions;
    expect(instructions).toContain("TEST task");
    expect(instructions).toContain("IMPLEMENTATION task");
  });
});

describe("getMethodology", () => {
  it("returns default profile by name", () => {
    const result = getMethodology("default");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("default");
  });

  it("returns tdd profile by name", () => {
    const result = getMethodology("tdd");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("tdd");
  });

  it("returns null for unknown methodology name", () => {
    const result = getMethodology("bdd");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = getMethodology("");
    expect(result).toBeNull();
  });
});

describe("getActiveMethodology", () => {
  it("returns default when config is null", () => {
    const result = getActiveMethodology("/project", null);
    expect(result.name).toBe("default");
  });

  it("returns default when config has no methodology field", () => {
    const result = getActiveMethodology("/project", {});
    expect(result.name).toBe("default");
  });

  it("returns tdd when config specifies tdd", () => {
    const result = getActiveMethodology("/project", { methodology: "tdd" });
    expect(result.name).toBe("tdd");
  });

  it("falls back to default for unknown methodology in config", () => {
    const result = getActiveMethodology("/project", { methodology: "unknown-method" });
    expect(result.name).toBe("default");
  });
});
