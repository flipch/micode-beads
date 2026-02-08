import { describe, expect, it } from "bun:test";

import { primaryAgent } from "../../src/agents/commander";

describe("commander agent", () => {
  it("should not reference handoff agents in prompt", () => {
    // Guards against: re-introduction of removed handoff agent references in commander prompt
    expect(primaryAgent.prompt).not.toContain("handoff-creator");
    expect(primaryAgent.prompt).not.toContain("handoff-resumer");
    expect(primaryAgent.prompt).not.toContain('<phase name="handoff">');
    expect(primaryAgent.mode).toBe("primary");
    expect(primaryAgent.description).toBeDefined();
    expect(typeof primaryAgent.description).toBe("string");
    expect(primaryAgent.description!.length).toBeGreaterThan(0);
  });

  it("should still reference ledger", () => {
    // Guards against: removal of ledger-creator spawning capability from commander prompt
    expect(primaryAgent.prompt).toContain("ledger");
    expect(primaryAgent.prompt).toContain("ledger-creator");
  });

  it("should have identity and values sections in prompt", () => {
    // Guards against: accidental removal of critical prompt personality sections
    expect(primaryAgent.prompt).toContain("<identity>");
    expect(primaryAgent.prompt).toContain("Commander");
    expect(primaryAgent.prompt).toContain("<values>");
    expect(primaryAgent.prompt).toContain("<relationship>");
    expect(primaryAgent.temperature).toBe(0.2);
  });
});
