import * as v from "valibot";

import { CONTRACT_VERSION } from "./types";

export const VerificationItemSchema = v.object({
  taskId: v.string(),
  category: v.union([
    v.literal("completeness"),
    v.literal("test-coverage"),
    v.literal("plan-adherence"),
    v.literal("test-pass"),
  ]),
  status: v.union([v.literal("pass"), v.literal("fail")]),
  detail: v.optional(v.string()),
});

export const VerificationReportSchema = v.object({
  version: v.literal(CONTRACT_VERSION),
  featureId: v.string(),
  planPath: v.string(),
  overallStatus: v.union([v.literal("pass"), v.literal("fail")]),
  items: v.array(VerificationItemSchema),
  completedAt: v.string(),
});

export type VerificationItem = v.InferOutput<typeof VerificationItemSchema>;
export type VerificationReport = v.InferOutput<typeof VerificationReportSchema>;
