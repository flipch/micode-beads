import { describe, expect, it } from "bun:test";

import { verifierAgent } from "../../src/agents/verifier";

describe("verifier agent", () => {
  it("should be configured as a subagent", () => {
    expect(verifierAgent.mode).toBe("subagent");
  });

  it("should have a low temperature for deterministic verification", () => {
    expect(verifierAgent.temperature).toBe(0.2);
  });

  it("should have read-only tool permissions", () => {
    expect(verifierAgent.tools).toEqual({
      write: false,
      edit: false,
      task: false,
    });
  });

  it("should have a description mentioning verification", () => {
    expect(verifierAgent.description).toContain("verification");
  });

  it("should include completeness check in prompt", () => {
    expect(verifierAgent.prompt).toContain('check name="completeness"');
  });

  it("should include test-coverage check in prompt", () => {
    expect(verifierAgent.prompt).toContain('check name="test-coverage"');
  });

  it("should include plan-adherence check in prompt", () => {
    expect(verifierAgent.prompt).toContain('check name="plan-adherence"');
  });

  it("should include test-pass check in prompt", () => {
    expect(verifierAgent.prompt).toContain('check name="test-pass"');
  });

  it("should include verification report output format", () => {
    expect(verifierAgent.prompt).toContain("## Verification Report");
  });

  it("should include severity levels", () => {
    expect(verifierAgent.prompt).toContain("CRITICAL");
    expect(verifierAgent.prompt).toContain("WARNING");
    expect(verifierAgent.prompt).toContain("INFO");
  });

  it("should forbid file modification", () => {
    expect(verifierAgent.prompt).toContain("NEVER modify any files");
  });
});
