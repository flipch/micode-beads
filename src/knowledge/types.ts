export const FRAGMENT_CATEGORIES = [
  "identity",
  "rules",
  "workflow",
  "tools",
  "constraints",
  "environment",
  "integration",
] as const;

export type FragmentCategory = (typeof FRAGMENT_CATEGORIES)[number];

export interface FragmentApplicability {
  /** Include only for these agent names */
  agents?: string[];
  /** Include only when these features are enabled */
  features?: string[];
  /** Include only in these agent modes */
  modes?: ("primary" | "subagent")[];
}

export interface KnowledgeFragment {
  /** Unique fragment identifier (kebab-case) */
  name: string;
  /** Fragment category for ordering and filtering */
  category: FragmentCategory;
  /** Human-readable description */
  description: string;
  /** The actual prompt content */
  content: string;
  /** Optional: only include when these conditions are met */
  applicability?: FragmentApplicability;
}

export interface AgentKnowledgeDef {
  /** Agent name matching the agents record key */
  agent: string;
  /** Ordered list of fragment names to compose */
  fragments: string[];
  /** Additional inline content (for agent-specific prompt text not worth fragmenting) */
  inlineContent?: string;
}

export interface FragmentRegistry {
  /** All loaded fragments indexed by name */
  fragments: Map<string, KnowledgeFragment>;
  /** Get a fragment by name, throws if missing */
  get(name: string): KnowledgeFragment;
  /** Get all fragments for a category */
  byCategory(category: FragmentCategory): KnowledgeFragment[];
  /** List all fragment names */
  names(): string[];
  /** Check if a fragment exists */
  has(name: string): boolean;
}
