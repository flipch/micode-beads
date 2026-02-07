import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { OutputOptions } from "../../src/cli/output";
import { EXIT_SUCCESS, EXIT_USAGE, EXIT_WORKFLOW } from "../../src/cli/router";
import {
  handleWorkflowCorrect,
  handleWorkflowList,
  handleWorkflowReset,
  handleWorkflowResume,
  handleWorkflowStatus,
} from "../../src/cli/workflow";
import { WorkflowManager } from "../../src/workflow/manager";

const HUMAN: OutputOptions = { json: false, color: false, verbose: false };
const JSON_OPTS: OutputOptions = { json: true, color: false, verbose: false };

const PROJECT_ROOT = resolve(import.meta.dir, "../..");

describe("handleWorkflowStatus", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cli-wf-status-"));
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it("should return EXIT_WORKFLOW when feature not found", async () => {
    const code = await handleWorkflowStatus(tmpDir, "nonexistent", HUMAN);
    expect(code).toBe(EXIT_WORKFLOW);
  });

  it("should return EXIT_WORKFLOW with JSON error when feature not found in JSON mode", async () => {
    const code = await handleWorkflowStatus(tmpDir, "nonexistent", JSON_OPTS);
    expect(code).toBe(EXIT_WORKFLOW);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("WORKFLOW_NOT_FOUND");
  });

  it("should display workflow state for existing feature", async () => {
    const manager = new WorkflowManager(tmpDir);
    await manager.createState("my-feature", false);

    const code = await handleWorkflowStatus(tmpDir, "my-feature", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("my-feature");
    expect(output).toContain("brainstorm");
  });

  it("should output JSON for existing feature in JSON mode", async () => {
    const manager = new WorkflowManager(tmpDir);
    await manager.createState("json-feature", true);

    const code = await handleWorkflowStatus(tmpDir, "json-feature", JSON_OPTS);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.featureId).toBe("json-feature");
    expect(parsed.data.afkMode).toBe(true);
    expect(parsed.data.currentStage).toBe("brainstorm");
  });

  it("should display stage statuses in human output", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("stages-test", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
    state = manager.startStage(state, "plan");
    await manager.saveState(state);

    const code = await handleWorkflowStatus(tmpDir, "stages-test", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Stage");
    expect(output).toContain("Status");
    expect(output).toContain("brainstorm");
    expect(output).toContain("plan");
  });

  it("should display corrections in human output", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("corr-test", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    state = manager.addCorrection(state, "Fix the approach", ["brainstorm"]);
    await manager.saveState(state);

    const code = await handleWorkflowStatus(tmpDir, "corr-test", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Corrections: 1");
    expect(output).toContain("Fix the approach");
  });
});

describe("handleWorkflowList", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cli-wf-list-"));
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it("should return empty list when no workflows exist", async () => {
    const code = await handleWorkflowList(tmpDir, HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("No workflows found");
  });

  it("should return empty JSON array when no workflows exist", async () => {
    const code = await handleWorkflowList(tmpDir, JSON_OPTS);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual([]);
  });

  it("should list multiple workflows", async () => {
    const manager = new WorkflowManager(tmpDir);
    await manager.createState("feature-a", false);
    await manager.createState("feature-b", true);

    const code = await handleWorkflowList(tmpDir, HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("feature-a");
    expect(output).toContain("feature-b");
  });

  it("should list workflows as JSON array", async () => {
    const manager = new WorkflowManager(tmpDir);
    await manager.createState("feat-1", false);
    await manager.createState("feat-2", true);

    const code = await handleWorkflowList(tmpDir, JSON_OPTS);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].featureId).toBeDefined();
    expect(parsed.data[1].featureId).toBeDefined();
  });

  it("should skip directories without state.json", async () => {
    const manager = new WorkflowManager(tmpDir);
    await manager.createState("valid-feature", false);
    mkdirSync(join(tmpDir, "thoughts", "workflow", "empty-dir"), { recursive: true });

    const code = await handleWorkflowList(tmpDir, JSON_OPTS);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].featureId).toBe("valid-feature");
  });
});

describe("handleWorkflowResume", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cli-wf-resume-"));
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it("should return EXIT_USAGE for invalid stage", async () => {
    const code = await handleWorkflowResume(tmpDir, "test", "invalid-stage", HUMAN);
    expect(code).toBe(EXIT_USAGE);
  });

  it("should return EXIT_WORKFLOW when feature not found", async () => {
    const code = await handleWorkflowResume(tmpDir, "missing", "plan", HUMAN);
    expect(code).toBe(EXIT_WORKFLOW);
  });

  it("should resume from specified stage and save state", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("resume-test", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
    state = manager.startStage(state, "plan");
    state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);
    state = manager.startStage(state, "implement");
    state = manager.completeStage(state, "implement", ["/tmp/code.ts"]);
    await manager.saveState(state);

    const code = await handleWorkflowResume(tmpDir, "resume-test", "implement", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const reloaded = await manager.loadState("resume-test");
    expect(reloaded?.stages.implement?.status).toBe("pending");
    expect(reloaded?.currentStage).toBe("implement");
  });

  it("should output JSON resume plan", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("json-resume", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", ["/tmp/a.md"]);
    await manager.saveState(state);

    const code = await handleWorkflowResume(tmpDir, "json-resume", "plan", JSON_OPTS);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.resumeFrom).toBe("plan");
    expect(parsed.data.stagesToSkip).toContain("brainstorm");
    expect(parsed.data.stagesToExecute).toContain("plan");
  });

  it("should show skip and execute stages in human output", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("human-resume", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", ["/tmp/d.md"]);
    await manager.saveState(state);

    const code = await handleWorkflowResume(tmpDir, "human-resume", "plan", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Resume from: plan");
    expect(output).toContain("brainstorm");
  });
});

describe("handleWorkflowCorrect", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cli-wf-correct-"));
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it("should return EXIT_USAGE for invalid stages", async () => {
    const code = await handleWorkflowCorrect(tmpDir, "test", "msg", "badstage", HUMAN);
    expect(code).toBe(EXIT_USAGE);
  });

  it("should return EXIT_WORKFLOW when feature not found", async () => {
    const code = await handleWorkflowCorrect(tmpDir, "missing", "fix it", "plan", HUMAN);
    expect(code).toBe(EXIT_WORKFLOW);
  });

  it("should add correction and reset affected stages", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("corr-test", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    state = manager.startStage(state, "plan");
    state = manager.completeStage(state, "plan", []);
    await manager.saveState(state);

    const code = await handleWorkflowCorrect(tmpDir, "corr-test", "Use JWT", "plan", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const reloaded = await manager.loadState("corr-test");
    expect(reloaded?.corrections).toHaveLength(1);
    expect(reloaded?.corrections[0].message).toBe("Use JWT");
    expect(reloaded?.stages.plan?.status).toBe("pending");
  });

  it("should handle comma-separated stages", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("multi-corr", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    state = manager.startStage(state, "plan");
    state = manager.completeStage(state, "plan", []);
    state = manager.startStage(state, "implement");
    state = manager.completeStage(state, "implement", []);
    await manager.saveState(state);

    const code = await handleWorkflowCorrect(tmpDir, "multi-corr", "Redo both", "plan,implement", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const reloaded = await manager.loadState("multi-corr");
    expect(reloaded?.stages.plan?.status).toBe("pending");
    expect(reloaded?.stages.implement?.status).toBe("pending");
    expect(reloaded?.stages.brainstorm?.status).toBe("completed");
  });

  it("should output JSON correction record", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("json-corr", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    await manager.saveState(state);

    const code = await handleWorkflowCorrect(tmpDir, "json-corr", "Fix design", "brainstorm", JSON_OPTS);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.correction.message).toBe("Fix design");
    expect(parsed.data.resetStages).toEqual(["brainstorm"]);
  });

  it("should return EXIT_USAGE when any stage in list is invalid", async () => {
    const code = await handleWorkflowCorrect(tmpDir, "test", "msg", "plan,invalid", HUMAN);
    expect(code).toBe(EXIT_USAGE);
  });
});

describe("handleWorkflowReset", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cli-wf-reset-"));
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  it("should return EXIT_USAGE for invalid stage", async () => {
    const code = await handleWorkflowReset(tmpDir, "test", "badstage", HUMAN);
    expect(code).toBe(EXIT_USAGE);
  });

  it("should return EXIT_WORKFLOW when feature not found", async () => {
    const code = await handleWorkflowReset(tmpDir, "missing", "plan", HUMAN);
    expect(code).toBe(EXIT_WORKFLOW);
  });

  it("should reset stage and save state", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("reset-test", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    state = manager.startStage(state, "plan");
    state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);
    await manager.saveState(state);

    const code = await handleWorkflowReset(tmpDir, "reset-test", "plan", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const reloaded = await manager.loadState("reset-test");
    expect(reloaded?.stages.plan?.status).toBe("pending");
    expect(reloaded?.currentStage).toBe("plan");
  });

  it("should reset downstream stages", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("downstream-reset", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    state = manager.startStage(state, "plan");
    state = manager.completeStage(state, "plan", []);
    state = manager.startStage(state, "implement");
    state = manager.completeStage(state, "implement", []);
    await manager.saveState(state);

    const code = await handleWorkflowReset(tmpDir, "downstream-reset", "plan", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const reloaded = await manager.loadState("downstream-reset");
    expect(reloaded?.stages.plan?.status).toBe("pending");
    expect(reloaded?.stages.implement?.status).toBe("pending");
    expect(reloaded?.stages.brainstorm?.status).toBe("completed");
  });

  it("should output JSON reset confirmation", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("json-reset", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    await manager.saveState(state);

    const code = await handleWorkflowReset(tmpDir, "json-reset", "brainstorm", JSON_OPTS);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.data.stage).toBe("brainstorm");
    expect(parsed.data.currentStage).toBe("brainstorm");
  });

  it("should mention downstream stages in human output when applicable", async () => {
    const manager = new WorkflowManager(tmpDir);
    let state = await manager.createState("human-reset", false);
    state = manager.startStage(state, "brainstorm");
    state = manager.completeStage(state, "brainstorm", []);
    state = manager.startStage(state, "plan");
    state = manager.completeStage(state, "plan", []);
    state = manager.startStage(state, "implement");
    state = manager.completeStage(state, "implement", []);
    await manager.saveState(state);

    const code = await handleWorkflowReset(tmpDir, "human-reset", "plan", HUMAN);
    expect(code).toBe(EXIT_SUCCESS);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Downstream stages also reset");
    expect(output).toContain("implement");
  });
});

describe("CLI workflow binary integration", () => {
  it("should show workflow help with workflow --help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "workflow", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("status");
    expect(stdout).toContain("list");
    expect(stdout).toContain("resume");
    expect(stdout).toContain("correct");
    expect(stdout).toContain("reset");
  });

  it("should show subcommand help with workflow status --help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "workflow", "status", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("feature-id");
    expect(stdout).toContain("--json");
  });

  it("should exit 2 for workflow status without feature-id", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "workflow", "status"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    await proc.exited;
    const exitCode = await proc.exited;
    expect(exitCode).toBe(2);
  });

  it("should exit 3 for workflow status of nonexistent feature with JSON", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "workflow", "status", "nonexistent", "--json"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(3);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe("WORKFLOW_NOT_FOUND");
  });

  it("should show workflow in root help", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", "--help"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("workflow");
  });

  it("should list empty workflows with JSON", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cli-wf-int-"));
    const cliScript = join(PROJECT_ROOT, "src/cli/index.ts");
    try {
      const proc = Bun.spawn(["bun", "run", cliScript, "workflow", "list", "--json"], {
        cwd: tmpDir,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, MICODE_NO_UPDATE_CHECK: "1" },
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual([]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
