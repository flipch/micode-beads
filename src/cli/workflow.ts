import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { WorkflowManager } from "../workflow/manager";
import { STAGE_NAMES, type StageName, type StageRecord } from "../workflow/state";
import {
  colorize,
  detectOutputOptions,
  formatTable,
  type OutputOptions,
  writeJsonError,
  writeJsonOutput,
} from "./output";
import { EXIT_SUCCESS, EXIT_USAGE, EXIT_WORKFLOW, formatCommandHelp, type SubcommandDef } from "./router";

function isValidStage(stage: string): stage is StageName {
  return (STAGE_NAMES as readonly string[]).includes(stage);
}

function stageStatusDisplay(status: string, opts: OutputOptions): string {
  switch (status) {
    case "completed":
      return colorize("completed", "\x1b[32m", opts);
    case "running":
      return colorize("running", "\x1b[33m", opts);
    case "failed":
      return colorize("failed", "\x1b[31m", opts);
    case "pending":
      return colorize("pending", "\x1b[90m", opts);
    case "skipped":
      return colorize("skipped", "\x1b[90m", opts);
    default:
      return status;
  }
}

function formatStageRecord(stage: StageName, record: StageRecord | undefined): string[] {
  if (!record) {
    return [stage, "pending", "0", "-", "-", "0"];
  }
  return [
    stage,
    record.status,
    String(record.version),
    record.startedAt ?? "-",
    record.completedAt ?? "-",
    String(record.artifactPaths.length),
  ];
}

function listWorkflowDirs(baseDir: string): string[] {
  const workflowDir = join(baseDir, "thoughts", "workflow");
  if (!existsSync(workflowDir)) {
    return [];
  }
  return readdirSync(workflowDir).filter((name) => {
    const fullPath = join(workflowDir, name);
    return statSync(fullPath).isDirectory() && existsSync(join(fullPath, "state.json"));
  });
}

export async function handleWorkflowStatus(baseDir: string, featureId: string, opts: OutputOptions): Promise<number> {
  const manager = new WorkflowManager(baseDir);
  const state = await manager.loadState(featureId);

  if (!state) {
    if (opts.json) {
      writeJsonError(
        "WORKFLOW_NOT_FOUND",
        `No workflow found for feature: ${featureId}`,
        "Create a workflow first by running a task with the commander agent.",
      );
    } else {
      console.error(`No workflow found for feature: ${featureId}`);
    }
    return EXIT_WORKFLOW;
  }

  if (opts.json) {
    writeJsonOutput(state, true);
    return EXIT_SUCCESS;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize(`Workflow: ${state.featureId}`, "\x1b[1m", opts));
  lines.push(`Mode: ${state.afkMode ? "AFK" : "Interactive"}`);
  lines.push(`Current Stage: ${state.currentStage}`);
  lines.push(`Created: ${state.createdAt}`);
  lines.push(`Updated: ${state.updatedAt}`);
  lines.push("");

  const headers = ["Stage", "Status", "Version", "Started", "Completed", "Artifacts"];
  const rows = STAGE_NAMES.map((stage) => {
    const record = state.stages[stage];
    const rawRow = formatStageRecord(stage, record);
    rawRow[1] = stageStatusDisplay(rawRow[1], opts);
    return rawRow;
  });

  lines.push(formatTable(headers, rows, opts));

  if (state.corrections.length > 0) {
    lines.push("");
    lines.push(`Corrections: ${state.corrections.length}`);
    for (const corr of state.corrections) {
      lines.push(`  - [${corr.timestamp}] ${corr.message} (stages: ${corr.affectedStages.join(", ")})`);
    }
  }

  lines.push("");
  console.log(lines.join("\n"));
  return EXIT_SUCCESS;
}

export async function handleWorkflowList(baseDir: string, opts: OutputOptions): Promise<number> {
  const featureIds = listWorkflowDirs(baseDir);
  const manager = new WorkflowManager(baseDir);

  const summaries: Array<{
    featureId: string;
    currentStage: string;
    afkMode: boolean;
    updatedAt: string;
  }> = [];

  for (const featureId of featureIds) {
    const state = await manager.loadState(featureId);
    if (state) {
      summaries.push({
        featureId: state.featureId,
        currentStage: state.currentStage,
        afkMode: state.afkMode,
        updatedAt: state.updatedAt,
      });
    }
  }

  if (opts.json) {
    writeJsonOutput(summaries, true);
    return EXIT_SUCCESS;
  }

  if (summaries.length === 0) {
    console.log("No workflows found.");
    return EXIT_SUCCESS;
  }

  const headers = ["Feature ID", "Current Stage", "AFK", "Updated"];
  const rows = summaries.map((s) => [s.featureId, s.currentStage, s.afkMode ? "yes" : "no", s.updatedAt]);

  console.log("");
  console.log(formatTable(headers, rows, opts));
  console.log("");
  return EXIT_SUCCESS;
}

export async function handleWorkflowResume(
  baseDir: string,
  featureId: string,
  fromStage: string,
  opts: OutputOptions,
): Promise<number> {
  if (!isValidStage(fromStage)) {
    const validStages = STAGE_NAMES.join(", ");
    if (opts.json) {
      writeJsonError("INVALID_STAGE", `Invalid stage: ${fromStage}. Valid stages: ${validStages}`);
    } else {
      console.error(`Invalid stage: ${fromStage}. Valid stages: ${validStages}`);
    }
    return EXIT_USAGE;
  }

  const manager = new WorkflowManager(baseDir);
  const state = await manager.loadState(featureId);

  if (!state) {
    if (opts.json) {
      writeJsonError("WORKFLOW_NOT_FOUND", `No workflow found for feature: ${featureId}`);
    } else {
      console.error(`No workflow found for feature: ${featureId}`);
    }
    return EXIT_WORKFLOW;
  }

  const resumeInfo = manager.getResumePoint(state, fromStage);
  const updatedState = manager.resetStage(state, fromStage);
  await manager.saveState(updatedState);

  if (opts.json) {
    writeJsonOutput(
      {
        featureId,
        resumeFrom: fromStage,
        stagesToSkip: resumeInfo.stagesToSkip,
        stagesToExecute: resumeInfo.stagesToExecute,
        loadedArtifacts: resumeInfo.loadedArtifacts,
      },
      true,
    );
    return EXIT_SUCCESS;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize(`Resume plan for: ${featureId}`, "\x1b[1m", opts));
  lines.push(`Resume from: ${fromStage}`);
  lines.push("");

  if (resumeInfo.stagesToSkip.length > 0) {
    lines.push(`Skipped (completed): ${resumeInfo.stagesToSkip.join(", ")}`);
  }
  lines.push(`To execute: ${resumeInfo.stagesToExecute.join(", ")}`);

  if (Object.keys(resumeInfo.loadedArtifacts).length > 0) {
    lines.push("");
    lines.push("Loaded artifacts:");
    for (const [stage, artifacts] of Object.entries(resumeInfo.loadedArtifacts)) {
      for (const artifact of artifacts) {
        lines.push(`  ${stage}: ${artifact}`);
      }
    }
  }

  lines.push("");
  lines.push("State has been updated. Resume the workflow in an OpenCode session.");
  lines.push("");
  console.log(lines.join("\n"));
  return EXIT_SUCCESS;
}

export async function handleWorkflowCorrect(
  baseDir: string,
  featureId: string,
  message: string,
  stagesStr: string,
  opts: OutputOptions,
): Promise<number> {
  const stageList = stagesStr.split(",").map((s) => s.trim());
  const invalidStages = stageList.filter((s) => !isValidStage(s));

  if (invalidStages.length > 0) {
    const validStages = STAGE_NAMES.join(", ");
    if (opts.json) {
      writeJsonError("INVALID_STAGE", `Invalid stage(s): ${invalidStages.join(", ")}. Valid stages: ${validStages}`);
    } else {
      console.error(`Invalid stage(s): ${invalidStages.join(", ")}. Valid stages: ${validStages}`);
    }
    return EXIT_USAGE;
  }

  const manager = new WorkflowManager(baseDir);
  const state = await manager.loadState(featureId);

  if (!state) {
    if (opts.json) {
      writeJsonError("WORKFLOW_NOT_FOUND", `No workflow found for feature: ${featureId}`);
    } else {
      console.error(`No workflow found for feature: ${featureId}`);
    }
    return EXIT_WORKFLOW;
  }

  const updatedState = manager.addCorrection(state, message, stageList as StageName[]);
  await manager.saveState(updatedState);

  const correction = updatedState.corrections[updatedState.corrections.length - 1];

  if (opts.json) {
    writeJsonOutput(
      {
        featureId,
        correction,
        resetStages: stageList,
      },
      true,
    );
    return EXIT_SUCCESS;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize("Correction applied", "\x1b[1m", opts));
  lines.push(`Feature: ${featureId}`);
  lines.push(`Message: ${message}`);
  lines.push(`Affected stages: ${stageList.join(", ")}`);
  lines.push(`Correction ID: ${correction.id}`);
  lines.push("");
  lines.push("Affected stages have been reset. Resume the workflow to apply the correction.");
  lines.push("");
  console.log(lines.join("\n"));
  return EXIT_SUCCESS;
}

export async function handleWorkflowReset(
  baseDir: string,
  featureId: string,
  stage: string,
  opts: OutputOptions,
): Promise<number> {
  if (!isValidStage(stage)) {
    const validStages = STAGE_NAMES.join(", ");
    if (opts.json) {
      writeJsonError("INVALID_STAGE", `Invalid stage: ${stage}. Valid stages: ${validStages}`);
    } else {
      console.error(`Invalid stage: ${stage}. Valid stages: ${validStages}`);
    }
    return EXIT_USAGE;
  }

  const manager = new WorkflowManager(baseDir);
  const state = await manager.loadState(featureId);

  if (!state) {
    if (opts.json) {
      writeJsonError("WORKFLOW_NOT_FOUND", `No workflow found for feature: ${featureId}`);
    } else {
      console.error(`No workflow found for feature: ${featureId}`);
    }
    return EXIT_WORKFLOW;
  }

  const updatedState = manager.resetStage(state, stage);
  await manager.saveState(updatedState);

  const downstreamStages = STAGE_NAMES.slice(STAGE_NAMES.indexOf(stage) + 1);
  const resetStages = [stage, ...downstreamStages.filter((s) => state.stages[s] !== undefined)];

  if (opts.json) {
    writeJsonOutput(
      {
        featureId,
        stage,
        resetStages,
        currentStage: updatedState.currentStage,
      },
      true,
    );
    return EXIT_SUCCESS;
  }

  const lines: string[] = [];
  lines.push("");
  lines.push(colorize("Stage reset", "\x1b[1m", opts));
  lines.push(`Feature: ${featureId}`);
  lines.push(`Reset stage: ${stage}`);
  if (resetStages.length > 1) {
    lines.push(`Downstream stages also reset: ${resetStages.slice(1).join(", ")}`);
  }
  lines.push(`Current stage: ${updatedState.currentStage}`);
  lines.push("");
  console.log(lines.join("\n"));
  return EXIT_SUCCESS;
}

const statusCommand: SubcommandDef = {
  name: "status",
  description: "Show workflow state for a feature",
  usage: "micode-beads workflow status <feature-id> [--json]",
  positional: [{ name: "feature-id", description: "Feature identifier", required: true }],
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    const opts = detectOutputOptions(args.flags);
    return handleWorkflowStatus(process.cwd(), args.positional[0], opts);
  },
};

const listCommand: SubcommandDef = {
  name: "list",
  description: "List all workflows",
  usage: "micode-beads workflow list [--json]",
  flags: [{ name: "json", description: "Output as structured JSON", type: "boolean" }],
  handler: async (args) => {
    const opts = detectOutputOptions(args.flags);
    return handleWorkflowList(process.cwd(), opts);
  },
};

const resumeCommand: SubcommandDef = {
  name: "resume",
  description: "Resume a workflow from a specific stage",
  usage: "micode-beads workflow resume <feature-id> --from <stage> [--json]",
  positional: [{ name: "feature-id", description: "Feature identifier", required: true }],
  flags: [
    { name: "from", description: "Stage to resume from", type: "string" },
    { name: "json", description: "Output as structured JSON", type: "boolean" },
  ],
  handler: async (args) => {
    const fromStage = args.flags.from as string | undefined;
    if (!fromStage) {
      console.error("Missing required flag: --from <stage>");
      console.error(`Valid stages: ${STAGE_NAMES.join(", ")}`);
      return EXIT_USAGE;
    }
    const opts = detectOutputOptions(args.flags);
    return handleWorkflowResume(process.cwd(), args.positional[0], fromStage, opts);
  },
};

const correctCommand: SubcommandDef = {
  name: "correct",
  description: "Apply a correction to a workflow",
  usage: "micode-beads workflow correct <feature-id> --message <msg> --stages <s1,s2> [--json]",
  positional: [{ name: "feature-id", description: "Feature identifier", required: true }],
  flags: [
    { name: "message", short: "m", description: "Correction message", type: "string" },
    { name: "stages", short: "s", description: "Comma-separated stages to reset", type: "string" },
    { name: "json", description: "Output as structured JSON", type: "boolean" },
  ],
  handler: async (args) => {
    const message = args.flags.message as string | undefined;
    const stages = args.flags.stages as string | undefined;
    if (!message) {
      console.error("Missing required flag: --message <msg>");
      return EXIT_USAGE;
    }
    if (!stages) {
      console.error("Missing required flag: --stages <s1,s2>");
      console.error(`Valid stages: ${STAGE_NAMES.join(", ")}`);
      return EXIT_USAGE;
    }
    const opts = detectOutputOptions(args.flags);
    return handleWorkflowCorrect(process.cwd(), args.positional[0], message, stages, opts);
  },
};

const resetCommand: SubcommandDef = {
  name: "reset",
  description: "Reset a workflow stage and its downstream stages",
  usage: "micode-beads workflow reset <feature-id> --stage <stage> [--json]",
  positional: [{ name: "feature-id", description: "Feature identifier", required: true }],
  flags: [
    { name: "stage", description: "Stage to reset", type: "string" },
    { name: "json", description: "Output as structured JSON", type: "boolean" },
  ],
  handler: async (args) => {
    const stage = args.flags.stage as string | undefined;
    if (!stage) {
      console.error("Missing required flag: --stage <stage>");
      console.error(`Valid stages: ${STAGE_NAMES.join(", ")}`);
      return EXIT_USAGE;
    }
    const opts = detectOutputOptions(args.flags);
    return handleWorkflowReset(process.cwd(), args.positional[0], stage, opts);
  },
};

export const workflowCommand: SubcommandDef = {
  name: "workflow",
  description: "Manage workflow state and stage transitions",
  usage: "micode-beads workflow <command> [options]",
  subcommands: [statusCommand, listCommand, resumeCommand, correctCommand, resetCommand],
  handler: async () => {
    console.log(formatCommandHelp(workflowCommand, ["workflow"], "micode-beads"));
    return EXIT_USAGE;
  },
};
