import type { AgentKnowledgeDef, FragmentRegistry, KnowledgeFragment } from "./types";
import { FRAGMENT_CATEGORIES } from "./types";

export interface ValidationError {
  type: "missing-fragment" | "orphaned-fragment" | "invalid-category" | "empty-content" | "duplicate-reference";
  message: string;
  agent?: string;
  fragment?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validates fragment integrity against agent knowledge definitions.
 * Detects:
 * - Missing fragments: referenced by an agent but not in registry
 * - Orphaned fragments: in registry but not referenced by any agent
 * - Invalid categories: fragments with categories not in FRAGMENT_CATEGORIES
 * - Empty content: fragments with empty or whitespace-only content
 * - Duplicate references: same fragment referenced multiple times in one agent
 */
export function validateFragments(registry: FragmentRegistry, agentDefs: AgentKnowledgeDef[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const referencedFragments = new Set<string>();

  const validCategories = new Set<string>(FRAGMENT_CATEGORIES);

  for (const def of agentDefs) {
    const seen = new Set<string>();

    for (const fragmentName of def.fragments) {
      referencedFragments.add(fragmentName);

      if (!registry.has(fragmentName)) {
        errors.push({
          type: "missing-fragment",
          message: `Agent "${def.agent}" references fragment "${fragmentName}" which does not exist in the registry`,
          agent: def.agent,
          fragment: fragmentName,
        });
      }

      if (seen.has(fragmentName)) {
        warnings.push({
          type: "duplicate-reference",
          message: `Agent "${def.agent}" references fragment "${fragmentName}" multiple times`,
          agent: def.agent,
          fragment: fragmentName,
        });
      }
      seen.add(fragmentName);
    }
  }

  for (const name of registry.names()) {
    if (!referencedFragments.has(name)) {
      warnings.push({
        type: "orphaned-fragment",
        message: `Fragment "${name}" is defined but not referenced by any agent`,
        fragment: name,
      });
    }
  }

  for (const name of registry.names()) {
    const fragment: KnowledgeFragment = registry.get(name);

    if (!validCategories.has(fragment.category)) {
      errors.push({
        type: "invalid-category",
        message: `Fragment "${name}" has invalid category "${fragment.category}". Valid categories: ${FRAGMENT_CATEGORIES.join(", ")}`,
        fragment: name,
      });
    }

    if (!fragment.content || fragment.content.trim().length === 0) {
      errors.push({
        type: "empty-content",
        message: `Fragment "${name}" has empty content`,
        fragment: name,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
