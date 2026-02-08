// tests/e2e/workflow-lifecycle.test.ts
//
// E2E tests for the full workflow state machine lifecycle.
// Exercises WorkflowManager through all 5 stages, artifact creation,
// snapshot versioning, resume points, corrections, and state persistence.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WorkflowManager } from "../../src/workflow/manager";
import { createWorkflowState, STAGE_NAMES } from "../../src/workflow/state";

describe("E2E: Workflow Lifecycle", () => {
  let tmpDir: string;
  let manager: WorkflowManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "e2e-workflow-"));
    manager = new WorkflowManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createArtifactFile(name: string, content: string): string {
    const artifactPath = join(tmpDir, name);
    const dir = artifactPath.substring(0, artifactPath.lastIndexOf("/"));
    if (dir !== tmpDir) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(artifactPath, content);
    return artifactPath;
  }

  describe("full 5-stage lifecycle", () => {
    it("should drive through all stages from brainstorm to commit and reach complete state", async () => {
      let state = await manager.createState("full-lifecycle", false);

      const stageArtifacts: Record<string, string[]> = {
        brainstorm: [createArtifactFile("design.md", "# Design\nArchitecture overview")],
        plan: [createArtifactFile("plan.md", "# Plan\n- Task 1\n- Task 2")],
        implement: [
          createArtifactFile("src/auth.ts", "export function auth() {}"),
          createArtifactFile("src/routes.ts", "export function routes() {}"),
        ],
        verify: [createArtifactFile("verification.md", "# Verification\nAll checks passed")],
        commit: [createArtifactFile("commit-log.md", "# Commit\nSHA: abc123")],
      };

      for (const stage of STAGE_NAMES) {
        state = manager.startStage(state, stage);
        expect(state.currentStage).toBe(stage);
        expect(state.stages[stage]?.status).toBe("running");
        expect(state.stages[stage]?.startedAt).toBeDefined();

        state = manager.completeStage(state, stage, stageArtifacts[stage]);
        expect(state.stages[stage]?.status).toBe("completed");
        expect(state.stages[stage]?.completedAt).toBeDefined();
        expect(state.stages[stage]?.version).toBe(1);
        expect(state.stages[stage]?.artifactPaths).toEqual(stageArtifacts[stage]);
      }

      expect(state.currentStage).toBe("complete");
      expect(state.corrections).toHaveLength(0);

      for (const stage of STAGE_NAMES) {
        expect(state.stages[stage]?.status).toBe("completed");
      }
    });

    it("should persist state at each stage transition and reload correctly", async () => {
      let state = await manager.createState("persist-lifecycle", true);

      state = manager.startStage(state, "brainstorm");
      await manager.saveState(state);

      const loaded = await manager.loadState("persist-lifecycle");
      expect(loaded).not.toBeNull();
      expect(loaded!.featureId).toBe("persist-lifecycle");
      expect(loaded!.afkMode).toBe(true);
      expect(loaded!.stages.brainstorm?.status).toBe("running");

      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
      state = manager.startStage(state, "plan");
      await manager.saveState(state);

      const reloaded = await manager.loadState("persist-lifecycle");
      expect(reloaded!.currentStage).toBe("plan");
      expect(reloaded!.stages.brainstorm?.status).toBe("completed");
      expect(reloaded!.stages.plan?.status).toBe("running");
    });

    it("should maintain correct timestamps throughout the lifecycle", async () => {
      let state = await manager.createState("timestamps", false);
      const createdAt = state.createdAt;

      expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      state = manager.startStage(state, "brainstorm");
      const brainstormStarted = state.stages.brainstorm!.startedAt!;
      expect(brainstormStarted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      state = manager.completeStage(state, "brainstorm", []);
      const brainstormCompleted = state.stages.brainstorm!.completedAt!;
      expect(brainstormCompleted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(brainstormCompleted).getTime()).toBeGreaterThanOrEqual(new Date(brainstormStarted).getTime());
    });
  });

  describe("artifact file creation and verification", () => {
    it("should track artifact paths through stage completion and verify files exist on disk", async () => {
      const designDoc = createArtifactFile("design-doc.md", "# Design Document\n\n## Overview\nAuth module design");
      const planDoc = createArtifactFile("implementation-plan.md", "# Plan\n\n## Tasks\n1. Auth\n2. Routes");

      let state = await manager.createState("artifact-verify", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [designDoc]);

      expect(state.stages.brainstorm?.artifactPaths).toEqual([designDoc]);
      expect(existsSync(designDoc)).toBe(true);
      expect(readFileSync(designDoc, "utf-8")).toContain("Auth module design");

      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", [planDoc]);

      expect(state.stages.plan?.artifactPaths).toEqual([planDoc]);
      expect(existsSync(planDoc)).toBe(true);
      expect(readFileSync(planDoc, "utf-8")).toContain("Auth");
    });

    it("should handle multiple artifacts per stage", async () => {
      const file1 = createArtifactFile("module-a.ts", "export const a = 1;");
      const file2 = createArtifactFile("module-b.ts", "export const b = 2;");
      const file3 = createArtifactFile("module-c.ts", "export const c = 3;");

      let state = await manager.createState("multi-artifact", false);
      state = manager.startStage(state, "implement");
      state = manager.completeStage(state, "implement", [file1, file2, file3]);

      expect(state.stages.implement?.artifactPaths).toHaveLength(3);
      for (const path of [file1, file2, file3]) {
        expect(existsSync(path)).toBe(true);
      }
    });
  });

  describe("snapshot versioning", () => {
    it("should create versioned snapshots for completed stages with artifacts", async () => {
      const artifact = createArtifactFile("design-v1.md", "# Design v1");

      let state = await manager.createState("snapshot-test", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [artifact]);
      await manager.snapshotStage(state, "brainstorm");

      const snapshots = manager.listSnapshots("snapshot-test", "brainstorm");
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toBe("brainstorm-v1");

      const snapshotDir = join(tmpDir, "thoughts", "workflow", "snapshot-test", "snapshots", "brainstorm-v1");
      expect(existsSync(snapshotDir)).toBe(true);
      expect(existsSync(join(snapshotDir, "design-v1.md"))).toBe(true);
      expect(readFileSync(join(snapshotDir, "design-v1.md"), "utf-8")).toBe("# Design v1");
    });

    it("should create multiple snapshot versions when a stage is re-executed", async () => {
      const artifact = createArtifactFile("doc.md", "content");

      let state = await manager.createState("multi-snapshot", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [artifact]);
      await manager.snapshotStage(state, "brainstorm");

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [artifact]);
      await manager.snapshotStage(state, "brainstorm");

      const snapshots = manager.listSnapshots("multi-snapshot", "brainstorm");
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]).toBe("brainstorm-v1");
      expect(snapshots[1]).toBe("brainstorm-v2");
    });

    it("should snapshot artifacts across multiple stages independently", async () => {
      const designArtifact = createArtifactFile("design.md", "design content");
      const planArtifact = createArtifactFile("plan.md", "plan content");

      let state = await manager.createState("cross-stage-snap", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", [designArtifact]);
      await manager.snapshotStage(state, "brainstorm");

      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", [planArtifact]);
      await manager.snapshotStage(state, "plan");

      expect(manager.listSnapshots("cross-stage-snap", "brainstorm")).toHaveLength(1);
      expect(manager.listSnapshots("cross-stage-snap", "plan")).toHaveLength(1);
    });
  });

  describe("resume points", () => {
    it("should compute correct resume point skipping completed stages and loading their artifacts", async () => {
      let state = await manager.createState("resume-test", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);

      const resume = manager.getResumePoint(state, "implement");

      expect(resume.targetStage).toBe("implement");
      expect(resume.stagesToSkip).toEqual(["brainstorm", "plan"]);
      expect(resume.stagesToExecute).toEqual(["implement", "verify", "commit"]);
      expect(resume.loadedArtifacts).toEqual({
        brainstorm: ["/tmp/design.md"],
        plan: ["/tmp/plan.md"],
      });
    });

    it("should include uncompleted stages before target in stages to execute", async () => {
      let state = await manager.createState("resume-gaps", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);

      const resume = manager.getResumePoint(state, "implement");

      expect(resume.stagesToSkip).toEqual(["brainstorm"]);
      expect(resume.stagesToExecute).toContain("plan");
      expect(resume.stagesToExecute).toContain("implement");
    });

    it("should resume and re-execute from a mid-point after loading state", async () => {
      let state = await manager.createState("resume-execute", false);
      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);
      await manager.saveState(state);

      const newManager = new WorkflowManager(tmpDir);
      const loaded = await newManager.loadState("resume-execute");
      expect(loaded).not.toBeNull();

      const resume = newManager.getResumePoint(loaded!, "implement");
      expect(resume.stagesToSkip).toHaveLength(2);

      let resumed = newManager.startStage(loaded!, "implement");
      expect(resumed.stages.implement?.status).toBe("running");

      resumed = newManager.completeStage(resumed, "implement", ["/tmp/code.ts"]);
      expect(resumed.currentStage).toBe("verify");
      expect(resumed.stages.implement?.status).toBe("completed");
    });
  });

  describe("corrections", () => {
    it("should apply a correction that resets affected stages and preserves upstream", async () => {
      let state = await manager.createState("correction-test", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);
      state = manager.startStage(state, "implement");
      state = manager.completeStage(state, "implement", ["/tmp/code.ts"]);

      const corrected = manager.addCorrection(state, "Use JWT instead of sessions", ["plan", "implement"]);

      expect(corrected.stages.brainstorm?.status).toBe("completed");
      expect(corrected.stages.plan?.status).toBe("pending");
      expect(corrected.stages.implement?.status).toBe("pending");
      expect(corrected.corrections).toHaveLength(1);
      expect(corrected.corrections[0].message).toBe("Use JWT instead of sessions");
      expect(corrected.corrections[0].affectedStages).toEqual(["plan", "implement"]);
      expect(corrected.corrections[0].id).toMatch(/^corr-/);
      expect(corrected.corrections[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should allow re-execution after a correction resets stages", async () => {
      let state = await manager.createState("correct-reexec", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", ["/tmp/plan-v1.md"]);
      state = manager.startStage(state, "implement");
      state = manager.completeStage(state, "implement", ["/tmp/code-v1.ts"]);

      state = manager.addCorrection(state, "Rethink approach", ["plan"]);
      expect(state.stages.plan?.status).toBe("pending");
      expect(state.stages.implement?.status).toBe("pending");

      state = manager.startStage(state, "plan");
      expect(state.stages.plan?.status).toBe("running");

      state = manager.completeStage(state, "plan", ["/tmp/plan-v2.md"]);
      expect(state.stages.plan?.status).toBe("completed");
      expect(state.stages.plan?.version).toBe(2);
    });

    it("should accumulate multiple corrections without losing earlier ones", async () => {
      let state = await manager.createState("multi-correct", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", []);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", []);

      state = manager.addCorrection(state, "First correction", ["plan"]);
      expect(state.corrections).toHaveLength(1);

      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", []);

      state = manager.addCorrection(state, "Second correction", ["brainstorm"]);
      expect(state.corrections).toHaveLength(2);
      expect(state.corrections[0].message).toBe("First correction");
      expect(state.corrections[1].message).toBe("Second correction");
    });

    it("should also reset all downstream stages when a correction affects an upstream stage", async () => {
      let state = await manager.createState("downstream-reset", false);

      for (const stage of STAGE_NAMES) {
        state = manager.startStage(state, stage);
        state = manager.completeStage(state, stage, []);
      }
      expect(state.currentStage).toBe("complete");

      state = manager.addCorrection(state, "Redesign needed", ["brainstorm"]);

      expect(state.stages.brainstorm?.status).toBe("pending");
      expect(state.stages.plan?.status).toBe("pending");
      expect(state.stages.implement?.status).toBe("pending");
      expect(state.stages.verify?.status).toBe("pending");
      expect(state.stages.commit?.status).toBe("pending");
    });
  });

  describe("state persistence across manager instances", () => {
    it("should save complete lifecycle state and reload from a new manager instance", async () => {
      let state = await manager.createState("roundtrip", false);

      state = manager.startStage(state, "brainstorm");
      state = manager.completeStage(state, "brainstorm", ["/tmp/design.md"]);
      state = manager.startStage(state, "plan");
      state = manager.completeStage(state, "plan", ["/tmp/plan.md"]);
      state = manager.addCorrection(state, "Fix auth approach", ["plan"]);

      await manager.saveState(state);

      const newManager = new WorkflowManager(tmpDir);
      const loaded = await newManager.loadState("roundtrip");

      expect(loaded).not.toBeNull();
      expect(loaded!.featureId).toBe("roundtrip");
      expect(loaded!.afkMode).toBe(false);
      expect(loaded!.stages.brainstorm?.status).toBe("completed");
      expect(loaded!.stages.brainstorm?.artifactPaths).toEqual(["/tmp/design.md"]);
      expect(loaded!.stages.plan?.status).toBe("pending");
      expect(loaded!.corrections).toHaveLength(1);
      expect(loaded!.corrections[0].message).toBe("Fix auth approach");
    });

    it("should return null when loading non-existent feature from fresh manager", async () => {
      const freshManager = new WorkflowManager(tmpDir);
      const result = await freshManager.loadState("does-not-exist");
      expect(result).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should throw when attempting to complete a stage that is not running", () => {
      const state = createWorkflowState("err-test", false);

      expect(() => manager.completeStage(state, "brainstorm", [])).toThrow(
        'Cannot complete stage "brainstorm": stage is not running',
      );
    });

    it("should throw for invalid feature IDs containing special characters", () => {
      expect(manager.createState("../malicious", false)).rejects.toThrow("Invalid featureId");
    });

    it("should throw for feature IDs with spaces", () => {
      expect(manager.createState("has spaces", false)).rejects.toThrow("Invalid featureId");
    });
  });
});
