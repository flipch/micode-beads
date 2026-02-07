import * as v from "valibot";

export const TaskResultSchema = v.object({
  taskId: v.string(),
  beadsId: v.optional(v.string()),
  status: v.union([v.literal("approved"), v.literal("changes-requested"), v.literal("blocked")]),
  filePath: v.string(),
  testFilePath: v.string(),
  reviewCycles: v.number(),
  reviewSummary: v.optional(v.string()),
});

export const BatchResultSchema = v.object({
  batchNumber: v.number(),
  tasks: v.array(TaskResultSchema),
  totalTasks: v.number(),
  approved: v.number(),
  blocked: v.number(),
});

export const ExecutionResultSchema = v.object({
  version: v.literal(1),
  featureId: v.string(),
  planPath: v.string(),
  batches: v.array(BatchResultSchema),
  completedAt: v.string(),
  overallStatus: v.union([v.literal("success"), v.literal("partial"), v.literal("failed")]),
});

export type TaskResult = v.InferOutput<typeof TaskResultSchema>;
export type BatchResult = v.InferOutput<typeof BatchResultSchema>;
export type ExecutionResult = v.InferOutput<typeof ExecutionResultSchema>;
