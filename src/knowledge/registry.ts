import type { FragmentCategory, FragmentRegistry, KnowledgeFragment } from "./types";

/**
 * Creates a FragmentRegistry from an array of KnowledgeFragment objects.
 * Validates that fragment names are unique and throws on duplicates.
 */
export function createFragmentRegistry(fragments: KnowledgeFragment[]): FragmentRegistry {
  const fragmentMap = new Map<string, KnowledgeFragment>();
  const categoryIndex = new Map<FragmentCategory, KnowledgeFragment[]>();

  for (const fragment of fragments) {
    if (fragmentMap.has(fragment.name)) {
      throw new Error(`Duplicate fragment name: "${fragment.name}"`);
    }
    fragmentMap.set(fragment.name, fragment);

    const categoryList = categoryIndex.get(fragment.category) ?? [];
    categoryList.push(fragment);
    categoryIndex.set(fragment.category, categoryList);
  }

  return {
    fragments: fragmentMap,

    get(name: string): KnowledgeFragment {
      const fragment = fragmentMap.get(name);
      if (!fragment) {
        throw new Error(`Fragment not found: "${name}". Available fragments: ${[...fragmentMap.keys()].join(", ")}`);
      }
      return fragment;
    },

    byCategory(category: FragmentCategory): KnowledgeFragment[] {
      return categoryIndex.get(category) ?? [];
    },

    names(): string[] {
      return [...fragmentMap.keys()];
    },

    has(name: string): boolean {
      return fragmentMap.has(name);
    },
  };
}

/**
 * Loads the fragment registry from statically imported fragment modules.
 * Accepts an array of fragments (imported at build time from src/knowledge/fragments/).
 * This is the main entry point for plugin initialization.
 */
export function loadFragmentRegistry(fragments: KnowledgeFragment[]): FragmentRegistry {
  return createFragmentRegistry(fragments);
}
