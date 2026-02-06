import { describe, expect, it } from "bun:test";

import {
  type AttributedError,
  createAmbiguousError,
  createAttributedError,
  formatAttributedError,
} from "../../src/cli/errors";

describe("createAttributedError", () => {
  it("should create an error with component and message", () => {
    const err = createAttributedError("cli", "Command not found");
    expect(err.component).toBe("cli");
    expect(err.message).toBe("Command not found");
    expect(err.suggestion).toBeUndefined();
  });

  it("should include suggestion when provided", () => {
    const err = createAttributedError(
      "opencode",
      "OpenCode CLI not installed",
      "Install OpenCode from https://opencode.ai",
    );
    expect(err.component).toBe("opencode");
    expect(err.message).toBe("OpenCode CLI not installed");
    expect(err.suggestion).toBe("Install OpenCode from https://opencode.ai");
  });

  it("should accept all component types", () => {
    const components = ["cli", "plugin", "opencode", "config"] as const;
    for (const component of components) {
      const err = createAttributedError(component, "test");
      expect(err.component).toBe(component);
    }
  });
});

describe("createAmbiguousError", () => {
  it("should default to cli component", () => {
    const err = createAmbiguousError("Something went wrong");
    expect(err.component).toBe("cli");
  });

  it("should include doctor suggestion", () => {
    const err = createAmbiguousError("Unknown failure");
    expect(err.suggestion).toContain("micode-beads doctor");
    expect(err.suggestion).toContain("Unable to determine");
  });

  it("should preserve the original message", () => {
    const err = createAmbiguousError("Unexpected error during init");
    expect(err.message).toBe("Unexpected error during init");
  });
});

describe("formatAttributedError", () => {
  it("should format error with component label in plain mode", () => {
    const err: AttributedError = {
      component: "cli",
      message: "Unknown command: foo",
    };
    const output = formatAttributedError(err, false);
    expect(output).toBe("[cli] Error: Unknown command: foo");
  });

  it("should include suggestion when present", () => {
    const err: AttributedError = {
      component: "config",
      message: "Invalid opencode.json",
      suggestion: "Run `micode-beads doctor --fix` to repair configuration.",
    };
    const output = formatAttributedError(err, false);
    expect(output).toContain("[config] Error: Invalid opencode.json");
    expect(output).toContain("Suggestion: Run `micode-beads doctor --fix` to repair configuration.");
  });

  it("should add color to component label in color mode", () => {
    const err: AttributedError = {
      component: "plugin",
      message: "Plugin not registered",
    };
    const output = formatAttributedError(err, true);
    expect(output).toContain("\x1b[31m[plugin]\x1b[0m");
    expect(output).toContain("Error: Plugin not registered");
  });

  it("should format opencode component errors correctly", () => {
    const err = createAttributedError(
      "opencode",
      "OpenCode is not installed or not in PATH",
      "Install OpenCode: https://opencode.ai/docs/install",
    );
    const output = formatAttributedError(err, false);
    expect(output).toContain("[opencode]");
    expect(output).toContain("OpenCode is not installed or not in PATH");
    expect(output).toContain("https://opencode.ai/docs/install");
  });

  it("should format config component errors with fix suggestion", () => {
    const err = createAttributedError(
      "config",
      "micode-beads not registered in opencode.json",
      "Run `micode-beads doctor --fix` to add the plugin entry.",
    );
    const output = formatAttributedError(err, false);
    expect(output).toContain("[config]");
    expect(output).toContain("micode-beads doctor --fix");
  });

  it("should format ambiguous errors with doctor suggestion", () => {
    const err = createAmbiguousError("Cannot determine what went wrong");
    const output = formatAttributedError(err, false);
    expect(output).toContain("[cli]");
    expect(output).toContain("micode-beads doctor");
  });

  it("should not include suggestion line when suggestion is undefined", () => {
    const err: AttributedError = {
      component: "cli",
      message: "Something broke",
    };
    const output = formatAttributedError(err, false);
    expect(output).not.toContain("Suggestion:");
    expect(output).toBe("[cli] Error: Something broke");
  });
});
