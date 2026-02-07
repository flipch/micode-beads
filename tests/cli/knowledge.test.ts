import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { resolve } from "node:path";

import { handleKnowledgeList, handleKnowledgeShow, handleKnowledgeValidate } from "../../src/cli/knowledge";
import { EXIT_SUCCESS, EXIT_VALIDATION } from "../../src/cli/router";

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

describe("handleKnowledgeList", () => {
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

  it("should return EXIT_SUCCESS", () => {
    const code = handleKnowledgeList(false);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("should display table headers in human output", () => {
    handleKnowledgeList(false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Name");
    expect(output).toContain("Category");
    expect(output).toContain("Description");
    expect(output).toContain("Referenced By");
  });

  it("should show total count in human output", () => {
    handleKnowledgeList(false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Total:");
    expect(output).toContain("fragments");
  });

  it("should display fragment names in human output", () => {
    handleKnowledgeList(false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("primary-agent-env");
    expect(output).toContain("commander-core");
  });

  it("should output valid JSON in JSON mode", () => {
    handleKnowledgeList(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data.length).toBeGreaterThan(0);
  });

  it("should include expected fields in JSON output", () => {
    handleKnowledgeList(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    const first = parsed.data[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("category");
    expect(first).toHaveProperty("description");
    expect(first).toHaveProperty("referencedBy");
    expect(first).toHaveProperty("contentLength");
  });

  it("should filter by category in human output", () => {
    handleKnowledgeList(false, "environment");
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("primary-agent-env");
    expect(output).toContain("environment");
  });

  it("should filter by category in JSON mode", () => {
    handleKnowledgeList(true, "environment");
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    for (const item of parsed.data) {
      expect(item.category).toBe("environment");
    }
  });

  it("should show fewer results when filtered by category", () => {
    handleKnowledgeList(true);
    const allOutput = logSpy.mock.calls[0][0];
    const allParsed = JSON.parse(allOutput);
    const allCount = allParsed.data.length;

    logSpy.mockClear();
    handleKnowledgeList(true, "environment");
    const filteredOutput = logSpy.mock.calls[0][0];
    const filteredParsed = JSON.parse(filteredOutput);
    expect(filteredParsed.data.length).toBeLessThan(allCount);
    expect(filteredParsed.data.length).toBeGreaterThan(0);
  });

  it("should return EXIT_VALIDATION for invalid category", () => {
    const code = handleKnowledgeList(false, "nonexistent-category");
    expect(code).toBe(EXIT_VALIDATION);
  });

  it("should show error for invalid category in human mode", () => {
    handleKnowledgeList(false, "nonexistent-category");
    const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Invalid category");
    expect(output).toContain("Valid categories");
  });

  it("should return JSON error for invalid category", () => {
    handleKnowledgeList(true, "nonexistent-category");
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("INVALID_CATEGORY");
  });
});

describe("handleKnowledgeValidate", () => {
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
    const code = handleKnowledgeValidate(false);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("should display validation summary in human output", () => {
    handleKnowledgeValidate(false);
    const allOutput = [...logSpy.mock.calls.map((c) => c[0]), ...errorSpy.mock.calls.map((c) => c[0])].join("\n");
    expect(allOutput).toContain("Knowledge Fragment Validation");
    expect(allOutput).toContain("Fragments:");
    expect(allOutput).toContain("Agents with knowledge defs:");
  });

  it("should return valid JSON in JSON mode", () => {
    handleKnowledgeValidate(true);
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
    handleKnowledgeValidate(true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.data.totalFragments).toBeGreaterThan(0);
    expect(parsed.data.totalAgents).toBeGreaterThan(0);
  });
});

describe("handleKnowledgeShow", () => {
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

  it("should return EXIT_SUCCESS for known fragment", () => {
    const code = handleKnowledgeShow("primary-agent-env", false);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("should display fragment details in human output", () => {
    handleKnowledgeShow("primary-agent-env", false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Fragment: primary-agent-env");
    expect(output).toContain("Category:");
    expect(output).toContain("Description:");
    expect(output).toContain("Content length:");
  });

  it("should show referenced-by agents in human output", () => {
    handleKnowledgeShow("primary-agent-env", false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Referenced by:");
  });

  it("should show content preview in human output", () => {
    handleKnowledgeShow("primary-agent-env", false);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Content Preview:");
  });

  it("should return full JSON data for known fragment", () => {
    handleKnowledgeShow("primary-agent-env", true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe("primary-agent-env");
    expect(parsed.data).toHaveProperty("category");
    expect(parsed.data).toHaveProperty("description");
    expect(parsed.data).toHaveProperty("contentLength");
    expect(parsed.data).toHaveProperty("content");
    expect(parsed.data).toHaveProperty("applicability");
    expect(parsed.data).toHaveProperty("referencedBy");
    expect(parsed.data.content.length).toBeGreaterThan(0);
  });

  it("should include referencedBy agents in JSON output", () => {
    handleKnowledgeShow("primary-agent-env", true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed.data.referencedBy)).toBe(true);
    expect(parsed.data.referencedBy.length).toBeGreaterThan(0);
  });

  it("should return EXIT_VALIDATION for unknown fragment", () => {
    const code = handleKnowledgeShow("nonexistent-fragment", false);
    expect(code).toBe(EXIT_VALIDATION);
  });

  it("should show error for unknown fragment in human mode", () => {
    handleKnowledgeShow("nonexistent-fragment", false);
    const output = errorSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain('No fragment found with name: "nonexistent-fragment"');
  });

  it("should return JSON error for unknown fragment", () => {
    handleKnowledgeShow("nonexistent-fragment", true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("FRAGMENT_NOT_FOUND");
  });

  it("should show commander-core fragment details", () => {
    handleKnowledgeShow("commander-core", true);
    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe("commander-core");
    expect(parsed.data.contentLength).toBeGreaterThan(0);
  });
});

describe("CLI knowledge binary integration", () => {
  it("should show knowledge help with knowledge --help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "knowledge", "--help"], {
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

  it("should show knowledge in root help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("knowledge");
  });

  it("should list fragments as JSON", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "knowledge", "list", "--json"], {
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

  it("should list fragments filtered by category as JSON", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli/index.ts", "knowledge", "list", "--category", "environment", "--json"],
      {
        cwd: PROJECT_ROOT,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
      },
    );
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(true);
    for (const item of parsed.data) {
      expect(item.category).toBe("environment");
    }
  });

  it("should show fragment details as JSON", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "knowledge", "show", "primary-agent-env", "--json"], {
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
    expect(parsed.data.name).toBe("primary-agent-env");
  });

  it("should exit with error for unknown fragment show", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "knowledge", "show", "nonexistent", "--json"], {
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
    expect(parsed.error.code).toBe("FRAGMENT_NOT_FOUND");
  });

  it("should validate fragments as JSON", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "knowledge", "validate", "--json"], {
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

  it("should exit 2 for knowledge show without fragment-name", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "knowledge", "show"], {
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
