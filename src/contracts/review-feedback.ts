import * as v from "valibot";

export const ReviewCommentSchema = v.object({
  id: v.string(),
  path: v.string(),
  line: v.optional(v.number()),
  body: v.string(),
  author: v.string(),
  severity: v.union([v.literal("critical"), v.literal("major"), v.literal("minor"), v.literal("suggestion")]),
});

export const CorrectionTaskSchema = v.object({
  commentId: v.string(),
  filePath: v.string(),
  description: v.string(),
  status: v.union([v.literal("pending"), v.literal("applied"), v.literal("skipped")]),
  reason: v.optional(v.string()),
});

export const ReviewFeedbackSchema = v.object({
  version: v.literal(1),
  prNumber: v.number(),
  repository: v.string(),
  comments: v.array(ReviewCommentSchema),
  corrections: v.array(CorrectionTaskSchema),
  overallStatus: v.union([v.literal("all-addressed"), v.literal("partial"), v.literal("pending")]),
  processedAt: v.string(),
});

export type ReviewComment = v.InferOutput<typeof ReviewCommentSchema>;
export type CorrectionTask = v.InferOutput<typeof CorrectionTaskSchema>;
export type ReviewFeedback = v.InferOutput<typeof ReviewFeedbackSchema>;
