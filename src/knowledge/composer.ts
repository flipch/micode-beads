import type { AgentKnowledgeDef, FragmentRegistry } from "./types";

/**
 * Composes an agent prompt by resolving fragment references in order
 * and concatenating their content with double-newline separators.
 * Appends inlineContent at the end if present.
 */
export function composePrompt(def: AgentKnowledgeDef, registry: FragmentRegistry): string {
  const sections: string[] = [];

  for (const fragmentName of def.fragments) {
    const fragment = registry.get(fragmentName);
    sections.push(fragment.content);
  }

  if (def.inlineContent) {
    sections.push(def.inlineContent);
  }

  return sections.join("\n\n");
}
