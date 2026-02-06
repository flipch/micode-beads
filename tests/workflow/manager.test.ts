import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkflowManager } from "../../src/workflow/manager";
import { createWorkflowState } from "../../src/workflow/state";

describe("WorkflowManager", () => {
  let tmpDir: string;
  let manager: WorkflowManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-manager-test-"));
    manager = new WorkflowManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("createState", () => {
    it("should create and persist a new workflow state", async () => {
      const state = await manager.createState("my-feature", false);

      expect(state.featureId).toBe("my-feature");
      expect(state.afkMode).toBe(false);
      expect(state.currentStage).toBe("brainstorm");

      const statePath = join(tmpDir, "thoughts", "workflow", "my-feature", "state.json");
      expect(existsSync(statePath)).toBe(true);
    });

    it("should create state with AFK mode enabled", async () => {
      const state = await manager.createState("afk-feature", true);

      expect(state.afkMode).toBe(true);
    });
  });

  describe("loadState", () => {
    it("should return null for non-existent feature", async () => {
      const state = await manager.loadState("nonexistent");

      expect(state).toBeNull();
    });

    it("should load previously saved state", async () => {
      await manager.createState("persist-test", true);
      const loaded = await manager.loadState("persist-test");

      expect(loaded).not.toBeNull();
      expect(loaded?.featureId).toBe("persist-test");
      expect(loaded?.afkMode).toBe(true);
    });
  });

  describe("saveState", () => {
    it("should update the updatedAt timestamp on save", async () => {
      const state = await manager.createState("save-test", false);
      const originalUpdatedAt = state.updatedAt;

      await new Promise((r) => setTimeout(r, 5));
      await manager.saveState(state);

      const reloaded = await manager.loadState("save-test");
      expect(reloaded?.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe("startStage", () => {
    it("should transition a new stage from pending to running", () => {
      const state = createWorkflowState("test", false);
      const updated = manager.startStage(state, "brainstorm");

      expect(updated.stages.brainstorm?.status).toBe("running");
      expect(updated.stages.brainstorm?.startedAt).toBeDefined();
      expect(updated.currentStage).toBe("brainstorm");
    });

    it("should allow restarting a completed stage", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);

      const restarted = manager.startStage(state, "brainstorm");
      expect(restarted.stages.brainstorm?.status).toBe("running");
    });

    it("should allow restarting a failed stage", () => {
      let state = createWorkflowState("test", false);

      state = {
        ...state,
        stages: {
          brainstorm: {
            status: "failed",
            version: 0,
            artifactPaths: [],
            startedAt: new Date().toISOString(),
          },
        },
      };

      const restarted = manager.startStage(state, "brainstorm");
      expect(restarted.stages.brainstorm?.status).toBe("running");
    });
  });

  describe("completeStage", () => {
    it("should mark a running stage as completed with artifacts", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");

      const completed = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);

      expect(completed.stages.brainstorm?.status).toBe("completed");
      expect(completed.stages.brainstorm?.completedAt).toBeDefined();
      expect(completed.stages.brainstorm?.artifactPaths).toEqual(["/tmp/design.md"]);
    });

    it("should increment version on each completion", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);

      expect(state.stages.brainstorm?.version).toBe(1);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);

      expect(state.stages.brainstorm?.version).toBe(2);
    });

    it("should advance currentStage to the next stage", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);

      expect(state.currentStage).toBe("plan");
    });

    it("should set currentStage to complete after the last stage", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "commit");
      state = manager.completeStage(state, "commit", []);

      expect(state.currentStage).toBe("complete");
    });

    it("should throw when completing a stage that is not running", () => {
      const state = createWorkflowState("test", false);

      expect(() => manager.completeStage(state, "brainstorm", [])).toThrow(
        'Cannot complete stage "brainstorm": stage is not running',
      );
    });
  });

  describe("resetStage", () => {
    it("should reset a completed stage to pending", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/a.md"]);

      const reset = manager.resetStage(state, "brainstorm");

      expect(reset.stages.brainstorm?.status).toBe("pending");
      expect(reset.stages.brainstorm?.artifactPaths).toEqual([]);
      expect(reset.currentStage).toBe("brainstorm");
    });

    it("should preserve the version number after reset", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);

      const reset = manager.resetStage(state, "brainstorm");

      expect(reset.stages.brainstorm?.version).toBe(1);
    });

    it("should reset all downstream stages", () => {
      let state = createWorkflowState("test", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);
      state = manager.startStage(state, "implement");
      state = manager.completeStage(state, "implement", ["/tmp/code.ts"]);

      const reset = manager.resetStage(state, "plan");

      expect(reset.stages.plan?.status).toBe("pending");
      expect(reset.stages.implement?.status).toBe("pending");
      expect(reset.stages.brainstorm?.status).toBe("completed");
    });

    it("should return state unchanged for non-existent stage record", () => {
      const state = createWorkflowState("test", false);
      const result = manager.resetStage(state, "plan");

      expect(result).toEqual(state);
    });
  });

  describe("getResumePoint", () => {
    it("should skip completed stages before the target", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);

      const resume = manager.getResumePoint(state, "implement");

      expect(resume.targetStage).toBe("implement");
      expect(resume.stagesToSkip).toEqual(["brainstorm", "plan"]);
      expect(resume.stagesToExecute).toContain("implement");
      expect(resume.stagesToExecute).toContain("verify");
      expect(resume.stagesToExecute).toContain("commit");
      expect(resume.loadedArtifacts.brainstorm).toEqual(["/tmp/design.md"]);
      expect(resume.loadedArtifacts.plan).toEqual(["/tmp/plan.md"]);
    });

    it("should include incomplete stages before the target as stages to execute", () => {
      const state = createWorkflowState("test", false);

      const resume = manager.getResumePoint(state, "plan");

      expect(resume.stagesToSkip).toEqual([]);
      expect(resume.stagesToExecute).toContain("brainstorm");
      expect(resume.stagesToExecute).toContain("plan");
    });

    it("should include all stages when resuming from the first stage", () => {
      const state = createWorkflowState("test", false);

      const resume = manager.getResumePoint(state, "brainstorm");

      expect(resume.stagesToSkip).toEqual([]);
      expect(resume.stagesToExecute.length).toBe(5);
    });
  });

  describe("addCorrection", () => {
    it("should add a correction record and reset affected stages", () => {
      let state = createWorkflowState("test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", []);
      state = manager.startStage(state, "implement");
      state = manager.completeStage(state, "implement", []);

      const corrected = manager.addCorrection(state, "Use JWT instead of sessions", ["plan", "implement"]);

      expect(corrected.corrections.length).toBe(1);
      expect(corrected.corrections[0].message).toBe("Use JWT instead of sessions");
      expect(corrected.corrections[0].affectedStages).toEqual(["plan", "implement"]);
      expect(corrected.stages.plan?.status).toBe("pending");
      expect(corrected.stages.implement?.status).toBe("pending");
      expect(corrected.stages.brainstorm?.status).toBe("completed");
    });

    it("should generate a unique correction ID", () => {
      const state = createWorkflowState("test", false);
      const corrected = manager.addCorrection(state, "Fix auth", ["brainstorm"]);

      expect(corrected.corrections[0].id).toMatch(/^corr-/);
      expect(corrected.corrections[0].timestamp).toBeDefined();
    });
  });

  describe("snapshotStage", () => {
    it("should copy artifacts to a versioned snapshot directory", async () => {
      const artifactPath = join(tmpDir, "artifact.md");
      writeFileSync(artifactPath, "# Design Document");

      let state = createWorkflowState("snap-test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [artifactPath]);

      await manager.snapshotStage(state, "brainstorm");

      const snapshotDir = join(tmpDir, "thoughts", "workflow", "snap-test", "snapshots", "brainstorm-v1");
      expect(existsSync(snapshotDir)).toBe(true);
      expect(existsSync(join(snapshotDir, "artifact.md"))).toBe(true);
    });

    it("should not create a snapshot when no artifacts exist", async () => {
      let state = createWorkflowState("snap-empty", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);

      await manager.snapshotStage(state, "brainstorm");

      const snapshotsDir = join(tmpDir, "thoughts", "workflow", "snap-empty", "snapshots");
      expect(existsSync(snapshotsDir)).toBe(false);
    });
  });

  describe("listSnapshots", () => {
    it("should return empty array when no snapshots exist", () => {
      const snapshots = manager.listSnapshots("no-feature", "brainstorm");

      expect(snapshots).toEqual([]);
    });

    it("should list versioned snapshot directories for a stage", async () => {
      const artifactPath = join(tmpDir, "doc.md");
      writeFileSync(artifactPath, "content");

      let state = createWorkflowState("list-test", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [artifactPath]);
      await manager.snapshotStage(state, "brainstorm");

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [artifactPath]);
      await manager.snapshotStage(state, "brainstorm");

      const snapshots = manager.listSnapshots("list-test", "brainstorm");

      expect(snapshots.length).toBe(2);
      expect(snapshots[0]).toBe("brainstorm-v1");
      expect(snapshots[1]).toBe("brainstorm-v2");
    });
  });
});
