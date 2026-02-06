// src/workflow/state.ts
// Type definitions for workflow state machine
// Supports stage tracking, persistence, resumption, and corrections

export const STAGE_NAMES = ["brainstorm", "plan", "implement", "verify", "commit"] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export const STAGE_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  SKIPPED: "skipped",
  FAILED: "failed",
} as const;

export type StageStatus = (typeof STAGE_STATUSES)[keyof typeof STAGE_STATUSES];

export interface StageRecord {
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  version: number;
  artifactPaths: string[];
  inputHash?: string;
}

export interface CorrectionRecord {
  id: string;
  timestamp: string;
  message: string;
  affectedStages: StageName[];
  appliedAt?: string;
}

export interface WorkflowState {
  featureId: string;
  createdAt: string;
  updatedAt: string;
  currentStage: StageName | "complete";
  afkMode: boolean;
  stages: Partial<Record<StageName, StageRecord>>;
  corrections: CorrectionRecord[];
}

export interface ResumeInfo {
  targetStage: StageName;
  stagesToSkip: StageName[];
  stagesToExecute: StageName[];
  loadedArtifacts: Record<string, string[]>;
}

export interface ResearchDocument {
  path: string;
  content: string;
  format: "md" | "txt";
}

const VALID_TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  pending: ["running"],
  running: ["completed", "failed"],
  completed: ["running"],
  skipped: ["running"],
  failed: ["running"],
};

export function isValidTransition(from: StageStatus, to: StageStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function createStageRecord(): StageRecord {
  return {
    status: STAGE_STATUSES.PENDING,
    version: 0,
    artifactPaths: [],
  };
}

export function createWorkflowState(featureId: string, afkMode: boolean): WorkflowState {
  const now = new Date().toISOString();
  return {
    featureId,
    createdAt: now,
    updatedAt: now,
    currentStage: STAGE_NAMES[0],
    afkMode,
    stages: {},
    corrections: [],
  };
}
