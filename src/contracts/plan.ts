import * as v from "valibot";

import { CodeSnippetSchema } from "./types";

export const MicroTaskSchema = v.object({
  id: v.string(),
  beadsId: v.optional(v.string()),
  title: v.string(),
  filePath: v.string(),
  testFilePath: v.string(),
  description: v.string(),
  dependencies: v.array(v.string()),
  codeSnippets: v.optional(v.array(CodeSnippetSchema)),
});

export const BatchSchema = v.object({
  batchNumber: v.number(),
  tasks: v.array(MicroTaskSchema),
  description: v.string(),
});

export const PlanContractSchema = v.object({
  version: v.literal(1),
  featureId: v.string(),
  title: v.string(),
  overview: v.string(),
  approach: v.string(),
  batches: v.array(BatchSchema),
  createdAt: v.string(),
  beadsEpicId: v.optional(v.string()),
});

export type MicroTask = v.InferOutput<typeof MicroTaskSchema>;
export type Batch = v.InferOutput<typeof BatchSchema>;
export type PlanContract = v.InferOutput<typeof PlanContractSchema>;
