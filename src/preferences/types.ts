import * as v from "valibot";

/** Built-in preference categories */
export const PREFERENCE_CATEGORIES = [
  "naming-conventions",
  "parameter-style",
  "code-style",
  "patterns",
  "methodology",
  "language-idioms",
  "testing",
  "documentation",
] as const;

export type BuiltinPreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

/** Category type: built-in or custom string for extensibility */
export type PreferenceCategory = BuiltinPreferenceCategory | (string & {});

/** Preference scope levels with inheritance: global < project < file-pattern */
export type PreferenceScope = { type: "global" } | { type: "project" } | { type: "file-pattern"; pattern: string };

/** Provenance metadata for tracking preference origin */
export interface PreferenceProvenance {
  source: "manual" | "pr-feedback";
  reviewer?: string;
  date: string;
  originalComment?: string;
}

/** Core preference interface -- each preference belongs to exactly one category */
export interface Preference {
  id: string;
  category: PreferenceCategory;
  description: string;
  scope: PreferenceScope;
  enabled: boolean;
  provenance: PreferenceProvenance;
  examples?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Preference store file structure */
export interface PreferenceStore {
  version: 1;
  preferences: Preference[];
}

// -- Valibot schemas for validation at file boundaries --

export const PreferenceScopeSchema = v.union([
  v.object({ type: v.literal("global") }),
  v.object({ type: v.literal("project") }),
  v.object({ type: v.literal("file-pattern"), pattern: v.string() }),
]);

export const PreferenceProvenanceSchema = v.object({
  source: v.union([v.literal("manual"), v.literal("pr-feedback")]),
  reviewer: v.optional(v.string()),
  date: v.string(),
  originalComment: v.optional(v.string()),
});

export const PreferenceSchema = v.object({
  id: v.string(),
  category: v.string(),
  description: v.string(),
  scope: PreferenceScopeSchema,
  enabled: v.boolean(),
  provenance: PreferenceProvenanceSchema,
  examples: v.optional(v.array(v.string())),
  createdAt: v.string(),
  updatedAt: v.string(),
});

export const PreferenceStoreSchema = v.object({
  version: v.literal(1),
  preferences: v.array(PreferenceSchema),
});
