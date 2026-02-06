# Development Tasks: Preference System and Orchestration Enhancement

**Feature ID**: preference-system-and-orchestration
**Status**: In Progress
**Progress**: 63% (12 of 19 tasks)
**Estimated Effort**: 6 days
**Started**: 2026-02-05

## Overview

A unified preference system for micode-beads that enables developers to declare, persist, and automatically enforce coding preferences (naming, style, patterns, methodology) across the agent pipeline, plus a configurable orchestration layer supporting methodology selection (default, TDD) that alters planner/executor task sequencing. The system introduces a new domain module (`src/preferences/`) with 7 files, a hook (`preference-injector`), a tool (`preference_lookup`), a command agent (`preference-manager`), and modifications to config constants, config loader, agents index, and plugin wiring.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T11] - Foundation types and config constants, no dependencies on each other
2. [T2, T4, T5, T6, T10, T12] - All depend only on T1 (types), independent of each other
3. [T3, T7, T13] - T3 depends on T1+T2; T7 depends on T1-T6; T13 depends on T10
4. [T8, T9] - T8 depends on T2+T3+T5+T6; T9 depends on T2+T3+T5
5. [T14] - Wiring depends on all previous components

**Dependencies**:

- T2 -> T1 (data: uses Preference types and schemas)
- T3 -> [T1, T2] (data: resolves from store using types)
- T4 -> T1 (data: compares Preference objects)
- T5 -> T1 (data: formats Preference objects)
- T6 -> T1 (data: MethodologyProfile references Preference types)
- T7 -> [T1, T2, T3, T4, T5, T6] (build: barrel export of all module files)
- T8 -> [T2, T3, T5, T6] (interface: uses store, resolver, formatter, methodology)
- T9 -> [T2, T3, T5] (interface: uses store, resolver, formatter)
- T10 -> T1 (interface: agent prompt references preference types)
- T12 -> T1 (data: MicodeConfig references methodology type)
- T13 -> T10 (build: imports agent definition)
- T14 -> [T7, T8, T9, T11, T12, T13] (build: wires all components)

**Critical Path**: T1 -> T2 -> T3 -> T8 -> T14

## Task Breakdown

### Group 1: Foundation (No Dependencies)

- [x] **T1**: Implement preference data model types and Valibot schemas `[complexity:simple]`

    **Reference**: [design.md#31-preference-data-model](design.md#31-preference-data-model)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] File `src/preferences/types.ts` exists with all exported types: `PreferenceCategory`, `PreferenceScope`, `PreferenceProvenance`, `Preference`, `PreferenceStore`
    - [x] `PREFERENCE_CATEGORIES` constant array contains all 8 built-in categories: naming-conventions, parameter-style, code-style, patterns, methodology, language-idioms, testing, documentation
    - [x] `PreferenceCategory` union type accepts built-in categories and arbitrary strings for extensibility (AC-02c)
    - [x] Valibot schemas exported: `PreferenceScopeSchema`, `PreferenceProvenanceSchema`, `PreferenceSchema`, `PreferenceStoreSchema`
    - [x] Schemas validate correct objects and reject malformed input (scope variants, provenance variants)
    - [x] All types use Valibot for validation, consistent with existing mindmodel schema patterns

    **Implementation Summary**:

    - **Files**: `src/preferences/types.ts`
    - **Approach**: Created types module following mindmodel/types.ts pattern -- interfaces for data shapes, Valibot schemas for file boundary validation, `as const` categories array with extensible union type via `(string & {})`
    - **Deviations**: None
    - **Tests**: 14/14 passing (tests/preferences/types.test.ts)

    **Review Feedback** (Attempt 1):
    - **Status**: FAILURE
    - **Issues**:
        - [comments] `src/preferences/types.ts:1` has file path comment `// src/preferences/types.ts` -- this is obvious narration (the filename is already the file path). Remove it.
        - [comments] `src/preferences/types.ts:18` JSDoc contains acceptance criteria ID `(AC-02c)` -- feature/task IDs must not appear in production code comments. Remove the `(AC-02c)` reference from the comment.
        - [comments] `src/preferences/types.ts:32` JSDoc contains acceptance criteria ID `(AC-02b)` -- feature/task IDs must not appear in production code comments. Remove the `(AC-02b)` reference from the comment.
        - [comments] `tests/preferences/types.test.ts:1` has file path comment `// tests/preferences/types.test.ts` -- obvious narration. Remove it.
    - **Guidance**: Remove 4 comments: (1) delete line 1 of `src/preferences/types.ts` (file path comment), (2) in line 18 of `src/preferences/types.ts` change the JSDoc to `/** Category type: built-in or custom string for extensibility */`, (3) in line 32 change the JSDoc to `/** Core preference interface -- each preference belongs to exactly one category */`, (4) delete line 1 of `tests/preferences/types.test.ts` (file path comment). Then amend the existing commit.

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T11**: Add preference configuration constants to config utility `[complexity:simple]`

    **Reference**: [design.md#311-config-constants-updates](design.md#311-config-constants-updates)

    **Effort**: 1 hour

    **Acceptance Criteria**:

    - [x] `src/utils/config.ts` modified with new `preferences` section in the config object
    - [x] Constants defined: `globalFile` ("preferences.yaml"), `projectFile` ("preferences.yaml"), `projectDir` (".micode"), `maxInjectionTokens` (2000), `cacheTtlMs` (30000), `defaultMethodology` ("default")
    - [x] Existing config structure and exports are not broken
    - [x] All existing tests pass after modification

    **Implementation Summary**:

    - **Files**: `src/utils/config.ts`
    - **Approach**: Added `preferences` section before `mindmodel` section with all 6 constants matching design spec; follows existing pattern of JSDoc comments and numeric literals
    - **Deviations**: None
    - **Tests**: 363/363 passing (full suite, no regressions)

    **Review Feedback** (Attempt 1):
    - **Status**: FAILURE
    - **Issues**:
        - [comments] Issues found in T1 files (see T1 review feedback above). T11 code itself (`src/utils/config.ts`) has no comment violations -- JSDoc comments on config constants are appropriate.
    - **Guidance**: Fix T1 comment issues only. T11 implementation is correct and needs no changes. Both tasks share a single commit, so the fix requires amending the commit after correcting T1 files.

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | N/A |
    | Commit | PASS |
    | Comments | PASS |

### Group 2: Domain Modules (Depend on T1 Only)

- [x] **T2**: Implement preference store with YAML persistence and caching `[complexity:medium]`

    **Reference**: [design.md#32-preference-storage](design.md#32-preference-storage)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] File `src/preferences/store.ts` exists with all exported functions: `loadGlobalPreferences`, `loadProjectPreferences`, `loadAllPreferences`, `saveGlobalPreferences`, `saveProjectPreferences`, `addPreference`, `updatePreference`, `deletePreference`
    - [x] Global preferences loaded from `~/.config/opencode/preferences.yaml` path
    - [x] Project preferences loaded from `{projectDir}/.micode/preferences.yaml` path
    - [x] YAML parsing uses the `yaml` package (existing dependency)
    - [x] Valibot validation applied at file load boundary using `PreferenceStoreSchema`
    - [x] Missing files handled gracefully -- returns empty array, no errors (BR-05)
    - [x] Invalid YAML files handled gracefully -- returns empty array with warning logged
    - [x] In-memory cache with TTL (30s default from config constants) invalidated on write operations
    - [x] `addPreference` generates IDs in format `pref-{8-char-uuid-slice}` using `crypto.randomUUID()`
    - [x] `addPreference` auto-sets `createdAt` and `updatedAt` timestamps
    - [x] `updatePreference` preserves `createdAt`, updates `updatedAt`
    - [x] `deletePreference` returns boolean indicating success
    - [x] Preference files are written in human-readable YAML format (NFR-04, NFR-06)

    **Implementation Summary**:

    - **Files**: `src/preferences/store.ts`
    - **Approach**: YAML-based persistence with dual-file strategy (global ~/.config/opencode/ + project .micode/); in-memory Map cache with TTL validation and write-invalidation; Valibot schema validation at load boundary; graceful ENOENT handling with empty-array fallback; crypto.randomUUID-based ID generation
    - **Deviations**: None
    - **Tests**: 23/23 passing (tests/preferences/store.test.ts)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T4**: Implement preference conflict detection `[complexity:simple]`

    **Reference**: [design.md#34-conflict-detection](design.md#34-conflict-detection)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] File `src/preferences/conflict.ts` exists with exported `PreferenceConflict` interface and `detectConflicts` function
    - [x] Conflicts detected when incoming preference has same category AND overlapping scope with existing preference (AC-07a)
    - [x] Scope overlap logic: same scope type matches; file-pattern scopes overlap when patterns could match the same files
    - [x] Each conflict includes: existing preference, incoming preference, and human-readable reason string (AC-07b)
    - [x] No false positives from different categories (different categories never conflict)
    - [x] No semantic text analysis of descriptions -- purely structural detection (category + scope heuristic per D7)
    - [x] Returns empty array when no conflicts found

    **Implementation Summary**:

    - **Files**: `src/preferences/conflict.ts`
    - **Approach**: Structural conflict detection via category + scope overlap heuristic; conservative file-pattern overlap using literal prefix extraction (disjoint prefixes = no overlap); skips disabled and self-referencing preferences
    - **Deviations**: None
    - **Tests**: 11/11 passing (tests/preferences/conflict.test.ts)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T5**: Implement preference XML formatter with token budget `[complexity:simple]`

    **Reference**: [design.md#35-preference-formatting](design.md#35-preference-formatting)

    **Effort**: 3 hours

    **Acceptance Criteria**:

    - [x] File `src/preferences/formatter.ts` exists with exported functions: `formatPreferencesBlock`, `formatMethodologyBlock`, `formatEffectivePreferencesReport`
    - [x] `formatPreferencesBlock` produces XML in `<coding-preferences><category name="...">` structure matching design spec format (AC-04b)
    - [x] Preferences grouped by category within the XML block
    - [x] Token budget enforcement: total output measured against `maxInjectionTokens` (2000 default) using `config.tokens.charsPerToken` estimation
    - [x] When budget exceeded, preferences prioritized by: (1) category relevance to current agent, (2) recency (AC-04c)
    - [x] `formatMethodologyBlock` produces methodology-specific XML block
    - [x] `formatEffectivePreferencesReport` produces human-readable report showing scope origin and overrides (AC-08c)
    - [x] Empty preferences input returns empty string (no empty XML tags)

    **Implementation Summary**:

    - **Files**: `src/preferences/formatter.ts`
    - **Approach**: XML block formatting with `<coding-preferences>/<category>` structure; recency-first sorting for budget prioritization; per-category truncation when budget exceeded; methodology block uses `<active-methodology>` XML; effective report uses markdown with strikethrough for overridden entries
    - **Deviations**: None
    - **Tests**: 11/11 passing (tests/preferences/formatter.test.ts)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T6**: Implement methodology profiles and resolution `[complexity:simple]`

    **Reference**: [design.md#36-methodology-system](design.md#36-methodology-system)

    **Effort**: 3 hours

    **Acceptance Criteria**:

    - [x] File `src/preferences/methodology.ts` exists with exported types: `MethodologyProfile`, `MethodologyTaskOrdering`, `MethodologyPromptModifiers`
    - [x] `BUILTIN_METHODOLOGIES` record contains "default" and "tdd" profiles matching design spec
    - [x] "default" profile: `separateTestTasks: false`, `testFirst: false`, empty prompt modifiers
    - [x] "tdd" profile: `separateTestTasks: true`, `testFirst: true`, with planner/executor/implementer prompt modifiers containing TDD instructions (BR-07)
    - [x] TDD planner instructions enforce separate test and implementation micro-tasks with dependency ordering
    - [x] `getMethodology` returns profile by name or null for unknown names
    - [x] `getActiveMethodology` resolves from config, falling back to "default" when no methodology configured
    - [x] Interface designed for extensibility to custom methodology profiles (FR-09 placeholder)

    **Implementation Summary**:

    - **Files**: `src/preferences/methodology.ts`
    - **Approach**: Interfaces for MethodologyProfile/TaskOrdering/PromptModifiers; BUILTIN_METHODOLOGIES record with "default" (no-op) and "tdd" (test-first with XML prompt modifiers for planner/executor/implementer); getActiveMethodology accepts generic config object with optional methodology field for T12 independence
    - **Deviations**: None
    - **Tests**: 14/14 passing (tests/preferences/methodology.test.ts)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T10**: Implement preference manager agent definition `[complexity:medium]`

    **Reference**: [design.md#39-preference-manager-agent](design.md#39-preference-manager-agent)

    **Effort**: 5 hours

    **Acceptance Criteria**:

    - [x] File `src/agents/preference-manager.ts` exists with exported `preferenceManagerAgent` conforming to `AgentConfig`
    - [x] Agent configured as `mode: "subagent"` with `temperature: 0.2`
    - [x] Agent prompt covers all operations: declare preference, capture PR feedback, list/search, edit, disable, delete, view effective preferences, export/import
    - [x] PR feedback capture flow: accepts free text comment, extracts preference rule, category, scope, and stores provenance metadata (AC-03a, AC-03b, AC-03c)
    - [x] Provenance metadata for PR-sourced preferences includes: source ("pr-feedback"), reviewer name, date, original comment text (BR-04)
    - [x] Agent follows the pattern established by `project-initializer` and `ledger-creator` agents
    - [x] Agent has access to `preference_lookup` tool for querying existing preferences

    **Implementation Summary**:

    - **Files**: `src/agents/preference-manager.ts`
    - **Approach**: XML-structured prompt covering 11 operations (declare, capture-pr-feedback, list, search, edit, disable, enable, delete, effective, export, import); follows project-initializer/ledger-creator pattern with AgentConfig export, mode subagent, temperature 0.2, edit/task tools disabled; includes YAML format spec, scope precedence rules, conflict resolution guidance, and provenance preservation rules
    - **Deviations**: None
    - **Tests**: N/A (static agent configuration -- type safety validated by tsc, no testable logic)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | N/A |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T12**: Update config loader to parse methodology setting `[complexity:simple]`

    **Reference**: [design.md#310-config-loader-updates](design.md#310-config-loader-updates)

    **Effort**: 2 hours

    **Acceptance Criteria**:

    - [x] `src/config-loader.ts` modified: `MicodeConfig` interface includes optional `methodology?: string` field
    - [x] Methodology field parsed from `micode-beads.json` during config loading
    - [x] Valid methodology values: "default", "tdd", or any string (for future custom profiles)
    - [x] Missing methodology field defaults to undefined (resolved downstream to "default" by methodology.ts)
    - [x] Existing config loading behavior is fully preserved -- no regressions
    - [x] Existing config-loader tests pass after modification

    **Implementation Summary**:

    - **Files**: `src/config-loader.ts`
    - **Approach**: Added `methodology?: string` to MicodeConfig interface; added parsing block in loadMicodeConfig following the same typeof/trim/assign pattern used by compactionThreshold and fragments; non-string and empty-string values silently ignored
    - **Deviations**: None
    - **Tests**: 422/422 passing (full suite, no regressions)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | N/A |
    | Commit | PASS |
    | Comments | PASS |

### Group 3: Integration Modules (Mixed Dependencies)

- [x] **T3**: Implement preference scope resolver with glob matching `[complexity:medium]`

    **Reference**: [design.md#33-scope-resolution](design.md#33-scope-resolution)

    **Effort**: 5 hours

    **Acceptance Criteria**:

    - [x] File `src/preferences/resolver.ts` exists with exported functions: `resolvePreferences`, `getEffectivePreferences`
    - [x] Scope precedence enforced: file-pattern > project > global (BR-02, AC-08b)
    - [x] Within same scope level, most recently created preference takes precedence (BR-02)
    - [x] `resolvePreferences` filters by enabled status and resolves for given context (file path, agent name)
    - [x] `getEffectivePreferences` returns preferences annotated with `effectiveScope` and optional `overriddenBy` fields (AC-08c)
    - [x] Custom glob matcher implemented supporting `*` (single segment) and `**` (recursive) patterns -- no new dependency added (D8)
    - [x] Glob matcher handles common patterns: `*.ts`, `src/**/*.ts`, `tests/**`, `*.test.ts`
    - [x] File-pattern scope preferences only apply when file path matches the pattern (AC-08a)
    - [x] Disabled preferences (enabled: false) are excluded from resolution

    **Implementation Summary**:

    - **Files**: `src/preferences/resolver.ts`
    - **Approach**: Scope resolution with SCOPE_PRIORITY map (global=0, project=1, file-pattern=2) for sorting; custom glob-to-regex converter supporting *, **, and ? wildcards; getEffectivePreferences tracks per-category winners and annotates overridden entries; no external dependencies added
    - **Deviations**: None
    - **Tests**: 21/21 passing (tests/preferences/resolver.test.ts)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | PASS |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T7**: Create barrel export for preferences module `[complexity:simple]`

    **Reference**: [design.md#5-implementation-plan](design.md#5-implementation-plan) (T7)

    **Effort**: 1 hour

    **Acceptance Criteria**:

    - [x] File `src/preferences/index.ts` exists
    - [x] Re-exports all public types from `types.ts`
    - [x] Re-exports all public functions from `store.ts`, `resolver.ts`, `conflict.ts`, `formatter.ts`, `methodology.ts`
    - [x] Importing from `../preferences` or `../preferences/index` provides access to all public API surface
    - [x] No circular dependency issues

    **Implementation Summary**:

    - **Files**: `src/preferences/index.ts`
    - **Approach**: Explicit named re-exports from all 5 domain modules (conflict, formatter, methodology, resolver, store) plus types; follows mindmodel/index.ts barrel pattern with type-only exports using `type` keyword; 24 total exports verified
    - **Deviations**: None
    - **Tests**: 443/443 passing (full suite, no regressions)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | N/A |
    | Commit | PASS |
    | Comments | PASS |

- [x] **T13**: Register preference manager agent in agents index `[complexity:simple]`

    **Reference**: [design.md#5-implementation-plan](design.md#5-implementation-plan) (T13)

    **Effort**: 1 hour

    **Acceptance Criteria**:

    - [x] `src/agents/index.ts` modified to import `preferenceManagerAgent` from `./preference-manager`
    - [x] Agent registered in the agents record with key matching the agent name used by the `/preference` command
    - [x] Follows the same registration pattern as existing agents (project-initializer, ledger-creator)
    - [x] Existing agent registrations are not affected

    **Implementation Summary**:

    - **Files**: `src/agents/index.ts`
    - **Approach**: Added import of `preferenceManagerAgent` from `./preference-manager`; registered in agents record as `"preference-manager"` with spread + model override pattern matching project-initializer/ledger-creator; added to named exports block
    - **Deviations**: None
    - **Tests**: 443/443 passing (full suite, no regressions)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | PASS |
    | Accuracy | PASS |
    | Completeness | PASS |
    | Quality | PASS |
    | Testing | N/A |
    | Commit | PASS |
    | Comments | PASS |

### Group 4: Pipeline Integration (Hook and Tool)

- [x] **T8**: Implement preference injector hook for agent pipeline `[complexity:medium]`

    **Reference**: [design.md#37-preference-injector-hook](design.md#37-preference-injector-hook)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] File `src/hooks/preference-injector.ts` exists with exported `createPreferenceInjectorHook` factory function
    - [x] Factory follows the exact pattern of `createFragmentInjectorHook` -- receives plugin context and config, returns `chat.params` handler
    - [x] Handler loads all preferences (cached with TTL), determines current agent, resolves effective preferences
    - [x] Agent-category relevance filtering applied per design mapping (e.g., implementer gets naming/style/patterns, executor gets methodology only) (D10)
    - [x] Token budget limit applied with prioritization (category relevance, then recency)
    - [x] Preferences formatted as XML block via `formatPreferencesBlock`
    - [x] If methodology is active (not "default"), methodology block appended for planner/executor/implementer agents
    - [x] Injection positioned in pipeline: after fragment-injector, before ledger-loader (D4)
    - [x] No-op when no preferences exist -- zero overhead for projects without preferences (BR-05)
    - [x] Caching uses same TTL pattern as context-injector

    **Implementation Summary**:

    - **Files**: `src/hooks/preference-injector.ts`
    - **Approach**: Factory hook following createFragmentInjectorHook pattern; in-memory TTL cache for loaded preferences; agent-category relevance filtering via static mapping (6 agents with specific categories, fallback to all categories for unknown agents); methodology block injection for planner/executor/implementer when non-default; delegates to formatPreferencesBlock for XML formatting and token budget enforcement
    - **Deviations**: None
    - **Tests**: 14/14 passing (tests/hooks/preference-injector.test.ts)

- [ ] **T9**: Implement preference lookup tool for agent queries `[complexity:simple]`

    **Reference**: [design.md#38-preference-lookup-tool](design.md#38-preference-lookup-tool)

    **Effort**: 3 hours

    **Acceptance Criteria**:

    - [ ] File `src/tools/preference-lookup.ts` exists with exported `createPreferenceLookupTool` factory function
    - [ ] Follows the pattern of `createMindmodelLookupTool` and `createBatchReadTool`
    - [ ] Tool accepts query parameters: `query` (keyword/category string) and optional `scope` (file path for context)
    - [ ] Returns formatted preference list matching the query criteria
    - [ ] Category filter matches preferences by category name
    - [ ] Scope filter resolves effective preferences for the given file path
    - [ ] Keyword matching searches preference descriptions
    - [ ] Returns useful message when no preferences match
    - [ ] Tool definition includes proper name, description, and input schema

### Group 5: Final Wiring

- [ ] **T14**: Wire all preference components into plugin entry point `[complexity:medium]`

    **Reference**: [design.md#312-plugin-wiring-srcindexts](design.md#312-plugin-wiring-srcindexts)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] `src/index.ts` modified with imports for preference-injector hook, preference-lookup tool, and preference-manager agent
    - [ ] `createPreferenceInjectorHook` called with plugin context and config, result stored
    - [ ] `preference_lookup` tool added to the plugin tools registry
    - [ ] `preference-manager` agent added to the plugin agents registry
    - [ ] `/preference` command added to `config.command` mapping to the preference-manager agent
    - [ ] Preference injector hook inserted in `chat.params` pipeline after fragment-injector and before ledger-loader
    - [ ] Injection pipeline order verified: Fragments -> Preferences -> Ledger -> Project context -> Context window warnings
    - [ ] Plugin loads and initializes without errors when no preference files exist (backward compatibility)
    - [ ] All existing hooks, tools, agents, and commands continue to function

### User Docs

- [ ] **TD1**: Update architecture.md - Architectural Patterns, Data Flows, State Management `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/architecture.md`

    **Section**: Architectural Patterns, Data Flows, State Management

    **KB Source**: architecture.md:Architectural Patterns

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Preference system documented as a new architectural pattern alongside existing domain modules
    - [ ] Data flow updated to include preference injection in the context injection pipeline
    - [ ] State management section updated with preference YAML file persistence and in-memory caching

- [ ] **TD2**: Update modules.md - Core Modules, Module Dependencies, Module Metrics `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/modules.md`

    **Section**: Core Modules, Module Dependencies, Module Metrics

    **KB Source**: modules.md:Core Modules

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] `src/preferences/` module added with all 6 files documented (types, store, resolver, conflict, formatter, methodology)
    - [ ] Dependency graph updated to show preferences module relationships
    - [ ] Module metrics updated with new file count and line estimates

- [ ] **TD3**: Update patterns.md - Extension Mechanisms `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/patterns.md`

    **Section**: Extension Mechanisms

    **KB Source**: patterns.md:Extension Mechanisms

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Preference injector hook factory pattern documented alongside existing hook patterns
    - [ ] Pattern description covers factory function signature, chat.params lifecycle, and caching strategy

- [ ] **TD4**: Update concept_map.md - Core Business Concepts, Terminology Glossary `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/concept_map.md`

    **Section**: Core Business Concepts, Terminology Glossary

    **KB Source**: concept_map.md:Core Business Concepts

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] "Preference" added as a domain concept with definition, scope levels, and relationship to mindmodel constraints
    - [ ] "Methodology" added as a domain concept with definition and relationship to orchestration pipeline
    - [ ] Terminology glossary updated with both new terms

- [ ] **TD5**: Update index.md - Project Structure `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: `.rp1/context/index.md`

    **Section**: Project Structure

    **KB Source**: index.md:Project Structure

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] `src/preferences/` directory added to the project structure tree with all 7 files listed
    - [ ] `src/hooks/preference-injector.ts` added to hooks section
    - [ ] `src/tools/preference-lookup.ts` added to tools section
    - [ ] `src/agents/preference-manager.ts` added to agents section

## Acceptance Criteria Checklist

### FR-01: Preference Declaration (Must Have)
- [ ] AC-01a: A developer can declare a preference specifying at minimum: category, description, and scope (T2, T10)
- [ ] AC-01b: The declared preference is persisted to a durable store that survives session restarts (T2)
- [ ] AC-01c: The preference takes effect in the current session without requiring a restart or reload command (T8)

### FR-02: Preference Categories (Must Have)
- [ ] AC-02a: The system supports at minimum 8 categories: naming-conventions, parameter-style, code-style, patterns, methodology, language-idioms, testing, documentation (T1)
- [ ] AC-02b: Each preference belongs to exactly one category (T1)
- [ ] AC-02c: Categories are extensible -- a user can define custom categories (T1)

### FR-03: PR Feedback Capture (Must Have)
- [ ] AC-03a: A developer can input a PR review comment and the system extracts or prompts for: the preference rule, the category, and the scope (T10)
- [ ] AC-03b: The captured preference includes provenance metadata: source, reviewer name, date, and original comment text (T1, T2, T10)
- [ ] AC-03c: Captured preferences are stored with the same persistence and injection behavior as manually declared preferences (T2, T8)

### FR-04: Preference Injection into Agent Pipeline (Must Have)
- [ ] AC-04a: Active preferences matching the current scope are injected into the system prompt of code-generating agents (T8)
- [ ] AC-04b: Preferences are formatted in a structured, parseable way within the system prompt (T5)
- [ ] AC-04c: The injection respects context window limits with prioritization by category relevance and recency (T5, T8)

### FR-05: Methodology Selection (Must Have)
- [ ] AC-05a: A developer can set a methodology preference ("default" or "tdd") via configuration (T6, T12)
- [ ] AC-05b: When TDD is selected, the planner produces test-first plans and the executor enforces ordering (T6, T8)
- [ ] AC-05c: The methodology selection is a preference stored and persisted per-project (T12)

### FR-06: Preference Management (Should Have)
- [ ] AC-06a: A developer can list all active preferences, optionally filtered by category or scope (T9, T10)
- [ ] AC-06b: A developer can disable a preference without deleting it (T2, T10)
- [ ] AC-06c: A developer can edit the description, scope, or category of an existing preference (T2, T10)
- [ ] AC-06d: A developer can permanently delete a preference (T2, T10)

### FR-07: Preference Conflict Detection (Should Have)
- [ ] AC-07a: When a new preference is added, the system checks for semantic conflicts in the same category and scope (T4)
- [ ] AC-07b: Conflicts are surfaced to the user with both preference descriptions displayed (T4, T10)
- [ ] AC-07c: The user can choose to keep one, keep both, or merge (T10)

### FR-08: Preference Scoping and Inheritance (Should Have)
- [ ] AC-08a: Preferences can be scoped to: global, project, or file-pattern (T1, T3)
- [ ] AC-08b: More specific scopes override less specific scopes for the same category (T3)
- [ ] AC-08c: A developer can view effective preferences for a given file path showing scope origin and overrides (T3, T5, T9)

### FR-09: Orchestration Methodology Extensibility (Could Have)
- [ ] AC-09a: A methodology profile can be defined in configuration with name, task-ordering rules, and prompt modifiers (T6)
- [ ] AC-09b: Custom profiles are selectable via the same mechanism as built-in methodologies (T6, T12)

### FR-10: Preference Export and Import (Could Have)
- [ ] AC-10a: Preferences can be exported to a single file (T10)
- [ ] AC-10b: A preference file can be imported with conflict detection applied (T4, T10)

## Definition of Done

- [ ] All 14 implementation tasks completed (T1-T14)
- [ ] All 5 documentation tasks completed (TD1-TD5)
- [ ] All acceptance criteria verified
- [ ] Code reviewed
- [ ] Docs updated
- [ ] No regressions in existing tests
- [ ] Preference system is no-op when no preference files exist (backward compatibility per BR-05)
