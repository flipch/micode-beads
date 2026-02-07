import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { resolve } from "node:path";

import { handleAgentList, handleAgentShow, handleAgentValidate } from "../../src/cli/agent";
import { EXIT_SUCCESS, EXIT_VALIDATION } from "../../src/cli/router";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

describe("handleAgentList", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("should return EXIT_SUCCESS", () => {
    const code = handleAgentList(false);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("should display agent names in human output", () => {
    handleAgentList(false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("commander");
    expect(output).toContain("planner");
    expect(output).toContain("implementer");
    expect(output).toContain("executor");
  });

  it("should show table headers in human output", () => {
    handleAgentList(false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Name");
    expect(output).toContain("Description");
    expect(output).toContain("Mode");
    expect(output).toContain("Model");
  });

  it("should show total count in human output", () => {
    handleAgentList(false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Total:");
    expect(output).toContain("agents");
  });

  it("should output valid JSON in JSON mode", () => {
    handleAgentList(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data.length).toBeGreaterThan(0);
  });

  it("should include all expected fields in JSON output", () => {
    handleAgentList(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    const first = parsed.data[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("description");
    expect(first).toHaveProperty("mode");
    expect(first).toHaveProperty("model");
    expect(first).toHaveProperty("fragmentCount");
  });

  it("should list commander as primary mode", () => {
    handleAgentList(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    const commander = parsed.data.find((a: { name: string }) => a.name === "commander");
    expect(commander).toBeDefined();
    expect(commander.mode).toBe("primary");
  });
});

describe("handleAgentShow", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should return EXIT_VALIDATION for unknown agent", () => {
    const code = handleAgentShow("nonexistent-agent", false);
    expect(code).toBe(EXIT_VALIDATION);
  });

  it("should show error for unknown agent in human mode", () => {
    handleAgentShow("nonexistent-agent", false);
    const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No agent found with name: nonexistent-agent");
  });

  it("should return JSON error for unknown agent", () => {
    handleAgentShow("nonexistent-agent", true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("AGENT_NOT_FOUND");
  });

  it("should return EXIT_SUCCESS for known agent", () => {
    const code = handleAgentShow("commander", false);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("should display agent details in human output", () => {
    handleAgentShow("commander", false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Agent: commander");
    expect(output).toContain("Description:");
    expect(output).toContain("Mode:");
    expect(output).toContain("Model:");
    expect(output).toContain("Prompt length:");
  });

  it("should display knowledge fragments for commander", () => {
    handleAgentShow("commander", false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Knowledge Fragments:");
  });

  it("should display prompt preview in human output", () => {
    handleAgentShow("commander", false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Prompt Preview:");
  });

  it("should return full JSON data for known agent", () => {
    handleAgentShow("commander", true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe("commander");
    expect(parsed.data.promptLength).toBeGreaterThan(0);
    expect(Array.isArray(parsed.data.fragments)).toBe(true);
    expect(parsed.data.fragments.length).toBeGreaterThan(0);
    expect(parsed.data.prompt.length).toBeGreaterThan(0);
  });

  it("should show agent without knowledge def", () => {
    const code = handleAgentShow("mm-orchestrator", false);
    expect(code).toBe(EXIT_SUCCESS);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("mm-orchestrator");
  });

  it("should show planner agent details", () => {
    handleAgentShow("planner", true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe("planner");
    expect(parsed.data.promptLength).toBeGreaterThan(0);
  });
});

describe("handleAgentValidate", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("should return EXIT_SUCCESS when validation passes", () => {
    const code = handleAgentValidate(false);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("should display validation summary in human output", () => {
    handleAgentValidate(false);
    const allOutput = [...logSpy.mock.calls.map((c) => c[0]), ...errorSpy.mock.calls.map((c) => c[0])].join("\n");
    expect(allOutput).toContain("Agent Knowledge Validation");
    expect(allOutput).toContain("Fragments:");
    expect(allOutput).toContain("Agents with knowledge defs:");
  });

  it("should return valid JSON in JSON mode", () => {
    handleAgentValidate(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveProperty("valid");
    expect(parsed.data).toHaveProperty("errors");
    expect(parsed.data).toHaveProperty("warnings");
    expect(parsed.data).toHaveProperty("totalFragments");
    expect(parsed.data).toHaveProperty("totalAgents");
  });

  it("should report fragment and agent counts in JSON", () => {
    handleAgentValidate(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.data.totalFragments).toBeGreaterThan(0);
    expect(parsed.data.totalAgents).toBeGreaterThan(0);
  });
});

describe("CLI agent binary integration", () => {
  it("should show agent help with agent --help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "agent", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("list");
    expect(stdout).toContain("show");
    expect(stdout).toContain("validate");
  });

  it("should show agent in root help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("agent");
  });

  it("should list agents as JSON", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "agent", "list", "--json"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.data.length).toBeGreaterThan(0);
  });

  it("should show agent details as JSON", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "agent", "show", "commander", "--json"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe("commander");
  });

  it("should exit with error for unknown agent show", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "agent", "show", "nonexistent", "--json"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(4);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("AGENT_NOT_FOUND");
  });

  it("should validate agents as JSON", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "agent", "validate", "--json"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.data.valid).toBe(true);
  });

  it("should exit 2 for agent show without agent-name", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "agent", "show"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    await proc.exited;
    const exitCode = await proc.exited;
    expect(exitCode).toBe(2);
  });
});
