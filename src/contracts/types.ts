import * as v from "valibot";

/** Code snippet attached to a micro-task for implementation context */
export const CodeSnippetSchema = v.object({
  path: v.string(),
  language: v.string(),
  code: v.string(),
});

export type CodeSnippet = v.InferOutput<typeof CodeSnippetSchema>;

/** Contract version used across all inter-agent data contracts */
export const CONTRACT_VERSION = 1 as const;
