import { describe, expect, it } from "bun:test";

import { prFeedbackAgent } from "../../src/agents/pr-feedback";

describe("pr-feedback agent", () => {
  it("should be configured as a subagent", () => {
    expect(prFeedbackAgent.mode).toBe("subagent");
  });

  it("should have a low temperature for deterministic processing", () => {
    expect(prFeedbackAgent.temperature).toBe(0.2);
  });

  it("should have a description mentioning PR review", () => {
    expect(prFeedbackAgent.description).toContain("PR review");
  });

  it("should include all workflow phases in prompt", () => {
    const phases = ["fetch", "parse", "group", "plan", "implement", "commit", "report"];

    for (const phase of phases) {
      expect(prFeedbackAgent.prompt).toContain(`phase name="${phase}"`);
    }
  });

  it("should include gh CLI integration", () => {
    expect(prFeedbackAgent.prompt).toContain("gh pr view");
    expect(prFeedbackAgent.prompt).toContain("gh api");
  });

  it("should forbid force-push", () => {
    expect(prFeedbackAgent.prompt).toContain("NEVER force-push");
  });

  it("should include comment classification guidance", () => {
    expect(prFeedbackAgent.prompt).toContain("actionable");
    expect(prFeedbackAgent.prompt).toContain("informational");
  });

  it("should include output format with summary table", () => {
    expect(prFeedbackAgent.prompt).toContain("## PR Review Feedback Report");
    expect(prFeedbackAgent.prompt).toContain("Addressed");
    expect(prFeedbackAgent.prompt).toContain("Unaddressed");
  });

  it("should include error handling scenarios", () => {
    expect(prFeedbackAgent.prompt).toContain("gh not authenticated");
    expect(prFeedbackAgent.prompt).toContain("PR not found");
    expect(prFeedbackAgent.prompt).toContain("push fails");
  });

  it("should reference spawn_agent for parallel implementers", () => {
    expect(prFeedbackAgent.prompt).toContain("spawn_agent");
    expect(prFeedbackAgent.prompt).toContain("implementer");
  });
});
