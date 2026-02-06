// src/workflow/manager.ts
// Workflow state manager - load, save, transition, version, resume
// Follows octto/state/persistence.ts patterns for filesystem persistence

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { MicodeConfig } from "../config-loader";
import { log } from "../utils/logger";
import {
  type CorrectionRecord,
  createStageRecord,
  createWorkflowState,
  isValidTransition,
  type ResumeInfo,
  STAGE_NAMES,
  STAGE_STATUSES,
  type StageName,
  type WorkflowState,
} from "./state";

const MODULE = "workflow";
const STATE_FILE = "state.json";
const SNAPSHOTS_DIR = "snapshots";

export class WorkflowManager {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private getFeatureDir(featureId: string): string {
    return join(this.baseDir, "thoughts", "workflow", featureId);
  }

  private getStatePath(featureId: string): string {
    return join(this.getFeatureDir(featureId), STATE_FILE);
  }

  private getSnapshotsDir(featureId: string): string {
    return join(this.getFeatureDir(featureId), SNAPSHOTS_DIR);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async loadState(featureId: string): Promise<WorkflowState | null> {
    const statePath = this.getStatePath(featureId);
    if (!existsSync(statePath)) {
      return null;
    }
    try {
      const content = await Bun.file(statePath).text();
      return JSON.parse(content) as WorkflowState;
    } catch (e) {
      log.error(MODULE, `Failed to load workflow state for ${featureId}`, e);
      return null;
    }
  }

  async saveState(state: WorkflowState): Promise<void> {
    const featureDir = this.getFeatureDir(state.featureId);
    this.ensureDir(featureDir);
    state.updatedAt = new Date().toISOString();
    const statePath = this.getStatePath(state.featureId);
    await Bun.write(statePath, JSON.stringify(state, null, 2));
  }

  async createState(featureId: string, afkMode: boolean): Promise<WorkflowState> {
    const state = createWorkflowState(featureId, afkMode);
    await this.saveState(state);
    return state;
  }

  startStage(state: WorkflowState, stage: StageName): WorkflowState {
    const record = state.stages[stage] ?? createStageRecord();

    if (record.status !== STAGE_STATUSES.PENDING && !isValidTransition(record.status, STAGE_STATUSES.RUNNING)) {
      throw new Error(`Invalid stage transition: ${stage} cannot move from "${record.status}" to "running"`);
    }

    record.status = STAGE_STATUSES.RUNNING;
    record.startedAt = new Date().toISOString();

    return {
      ...state,
      currentStage: stage,
      stages: { ...state.stages, [stage]: record },
    };
  }

  completeStage(state: WorkflowState, stage: StageName, artifacts: string[]): WorkflowState {
    const record = state.stages[stage];
    if (!record || record.status !== STAGE_STATUSES.RUNNING) {
      throw new Error(`Cannot complete stage "${stage}": stage is not running (status: ${record?.status ?? "none"})`);
    }

    record.status = STAGE_STATUSES.COMPLETED;
    record.completedAt = new Date().toISOString();
    record.version += 1;
    record.artifactPaths = artifacts;

    const stageIndex = STAGE_NAMES.indexOf(stage);
    const nextStage = stageIndex < STAGE_NAMES.length - 1 ? STAGE_NAMES[stageIndex + 1] : "complete";

    return {
      ...state,
      currentStage: nextStage as StageName | "complete",
      stages: { ...state.stages, [stage]: record },
    };
  }

  resetStage(state: WorkflowState, stage: StageName): WorkflowState {
    const record = state.stages[stage];
    if (!record) {
      return state;
    }

    const resetRecord = createStageRecord();
    resetRecord.version = record.version;

    const updatedStages = { ...state.stages, [stage]: resetRecord };

    const stageIndex = STAGE_NAMES.indexOf(stage);
    for (let i = stageIndex + 1; i < STAGE_NAMES.length; i++) {
      const downstreamStage = STAGE_NAMES[i];
      const downstreamRecord = updatedStages[downstreamStage];
      if (downstreamRecord) {
        const resetDownstream = createStageRecord();
        resetDownstream.version = downstreamRecord.version;
        updatedStages[downstreamStage] = resetDownstream;
      }
    }

    return {
      ...state,
      currentStage: stage,
      stages: updatedStages,
    };
  }

  getResumePoint(state: WorkflowState, targetStage: StageName): ResumeInfo {
    const targetIndex = STAGE_NAMES.indexOf(targetStage);
    const stagesToSkip: StageName[] = [];
    const stagesToExecute: StageName[] = [];
    const loadedArtifacts: Record<string, string[]> = {};

    for (let i = 0; i < STAGE_NAMES.length; i++) {
      const stage = STAGE_NAMES[i];
      if (i < targetIndex) {
        const record = state.stages[stage];
        if (record?.status === STAGE_STATUSES.COMPLETED) {
          stagesToSkip.push(stage);
          loadedArtifacts[stage] = record.artifactPaths;
        } else {
          stagesToExecute.push(stage);
        }
      } else {
        stagesToExecute.push(stage);
      }
    }

    return {
      targetStage,
      stagesToSkip,
      stagesToExecute,
      loadedArtifacts,
    };
  }

  addCorrection(state: WorkflowState, message: string, affectedStages: StageName[]): WorkflowState {
    const correction: CorrectionRecord = {
      id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      message,
      affectedStages,
    };

    let updatedState: WorkflowState = {
      ...state,
      corrections: [...state.corrections, correction],
    };

    for (const stage of affectedStages) {
      updatedState = this.resetStage(updatedState, stage);
    }

    return updatedState;
  }

  async snapshotStage(state: WorkflowState, stage: StageName): Promise<void> {
    const record = state.stages[stage];
    if (!record || record.artifactPaths.length === 0) {
      log.debug(MODULE, `No artifacts to snapshot for stage "${stage}"`);
      return;
    }

    const snapshotsDir = this.getSnapshotsDir(state.featureId);
    const snapshotDir = join(snapshotsDir, `${stage}-v${record.version}`);
    this.ensureDir(snapshotDir);

    for (const artifactPath of record.artifactPaths) {
      if (existsSync(artifactPath)) {
        const fileName = artifactPath.split("/").pop() ?? artifactPath;
        const destPath = join(snapshotDir, fileName);
        try {
          cpSync(artifactPath, destPath);
        } catch (e) {
          log.warn(
            MODULE,
            `Failed to snapshot artifact ${artifactPath}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    log.debug(MODULE, `Snapshot created for ${stage} v${record.version} at ${snapshotDir}`);
  }

  listSnapshots(featureId: string, stage: StageName): string[] {
    const snapshotsDir = this.getSnapshotsDir(featureId);
    if (!existsSync(snapshotsDir)) {
      return [];
    }

    const prefix = `${stage}-v`;
    return readdirSync(snapshotsDir)
      .filter((name) => name.startsWith(prefix))
      .sort();
  }

  static detectAfkMode(args: string, config: MicodeConfig | null): boolean {
    if (args.includes("--afk")) {
      return true;
    }

    if (process.env.MICODE_AFK === "1" || process.env.MICODE_AFK === "true") {
      return true;
    }

    if (config?.afk === true) {
      return true;
    }

    return false;
  }
}
