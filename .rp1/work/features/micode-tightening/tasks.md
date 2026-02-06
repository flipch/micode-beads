# Development Tasks: micode-beads Tightening

**Feature ID**: micode-tightening
**Status**: In Progress
**Progress**: 53% (8 of 15 tasks)
**Estimated Effort**: 8 days
**Started**: 2026-02-05

## Overview

Overhaul micode-beads across four axes: identity (README rewrite, installer, CLI init), workflow lifecycle (stage resumption, post-final correction, AFK mode), quality (tightened verification, enriched bead descriptions, configurable research dirs), and feedback loops (PR review feedback, AFK+PR combined mode). Introduces new modules (`src/workflow/`, `src/cli/`), two new agents (verifier, pr-feedback), and significant prompt updates across existing agents.

## Implementation DAG

**Parallel Groups** (tasks with no inter-dependencies):

1. [T1, T2, T4, T5, T6, T9] - Config extension, installer script, verifier agent, PR feedback agent, and README are all independent of each other
2. [T3, T7] - Workflow state module depends on T1 config schema; agent prompt updates depend on T1 config schema
3. [T8] - Command registration and index wiring depends on T3, T5, T6, T7
4. [T10] - Test suite depends on T1, T3, T4, T5, T6, T7

**Dependencies**:

- T3 -> T1 (data: workflow state reads config schema for researchDirs, afk)
- T7 -> T1 (data: agent prompts reference new config fields)
- T7 -> T3 (interface: agents interact with workflow state module API)
- T8 -> T3 (build: index.ts imports workflow module)
- T8 -> T5 (build: index.ts imports verifier agent)
- T8 -> T6 (build: index.ts imports PR feedback agent)
- T8 -> T7 (interface: wiring depends on final agent definitions)
- T10 -> [T1, T3, T4, T5, T6, T7] (sequential: tests validate all new modules)

**Critical Path**: T1 -> T3 -> T7 -> T8 -> T10

## Task Breakdown

### Independent Foundation (Parallel Group 1)

- [x] **T1**: Extend MicodeConfig with researchDirs, afk, and gitPr fields `[complexity:medium]`

    **Reference**: [design.md#36-config-extension](design.md#36-config-extension)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `MicodeConfig` interface in `src/config-loader.ts` includes `researchDirs?: string[]`, `afk?: boolean`, and `gitPr?: { draftByDefault?: boolean }` fields
    - [x] Parsing logic follows existing manual `typeof` checks and property allowlisting patterns
    - [x] `researchDirs` defaults to `['thoughts/shared/designs/']` when not specified
    - [x] `afk` defaults to `false` when not specified
    - [x] `gitPr.draftByDefault` defaults to `true` when not specified
    - [x] Invalid values for new fields are gracefully ignored with fallback to defaults
    - [x] Existing `micode-beads.json` configurations continue to work without modification

    **Implementation Summary**:

    - **Files**: `src/config-loader.ts`, `tests/config-loader.test.ts`
    - **Approach**: Added `GitPrConfig` interface and three new fields to `MicodeConfig`. Parsing follows existing patterns: `Array.isArray` with string filtering for `researchDirs`, `typeof === "boolean"` for `afk`, object check with boolean property extraction for `gitPr`. Added 20 tests covering valid values, invalid types, edge cases, and backward compatibility.
    - **Deviations**: None
    - **Tests**: 20/20 passing (new); 50/51 total (1 pre-existing failure unrelated to this task)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ✅ PASS |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [x] **T2**: Create CLI module with init command `[complexity:medium]`

    **Reference**: [design.md#32-new-module-srccli](design.md#32-new-module-srccli)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] `src/cli/index.ts` provides a minimal CLI entry point with `init`, `--help`, `--version` commands
    - [x] `src/cli/init.ts` implements the init command: dependency checks (bun, opencode, git), `opencode.json` creation/update, optional `.mindmodel/` scaffolding, `thoughts/` directory creation
    - [x] Init command is idempotent -- running twice does not corrupt existing configuration
    - [x] Init command reads existing config before writing (merge, not overwrite)
    - [x] `package.json` updated with `"bin": { "micode-beads": "dist/cli.js" }`
    - [x] Build script updated to include CLI build target: `bun build src/cli/index.ts --target bun --outfile dist/cli.js`
    - [x] Clear success/failure output with next-step instructions printed to stdout

    **Implementation Summary**:

    - **Files**: `src/cli/index.ts`, `src/cli/init.ts`, `package.json`
    - **Approach**: Created minimal CLI entry point with switch-based command routing (init, --help, --version). Init command uses Bun's `which()` for dependency checks (matching existing ast-grep/btca patterns), reads/merges existing opencode.json before writing, scaffolds .mindmodel/ on demand, and creates thoughts/ directory structure. Build script updated to produce dist/cli.js as a separate Bun bundle.
    - **Deviations**: Build script uses `--outfile dist/cli.js` without `--outdir` flag (design spec had both, but they conflict in Bun's bundler)
    - **Tests**: 368/369 passing (1 pre-existing failure unrelated to this task)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [x] **T4**: Create installer script `[complexity:medium]`

    **Reference**: [design.md#33-installer-script-scriptsinstallsh](design.md#33-installer-script-scriptsinstallsh)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] `scripts/install.sh` is a POSIX-compatible shell script
    - [x] Script detects OS (macOS, Linux) and architecture (x64, arm64)
    - [x] Script checks for npm/bun availability and installs via `npm install -g micode-beads@latest`
    - [x] Script falls back to downloading tarball from GitHub Releases if npm unavailable
    - [x] Script verifies installation via `micode-beads --version`
    - [x] Script includes checksum verification for downloaded artifacts
    - [x] Script uses HTTPS for all downloads
    - [x] Script provides clear error messages for unsupported platforms or network failures
    - [x] Script is pipeable from curl: `curl -fsSL https://... | sh`
    - [x] Script does not require sudo for default installation path

    **Implementation Summary**:

    - **Files**: `scripts/install.sh`
    - **Approach**: Created a POSIX-compatible (`#!/bin/sh`) installer script with platform detection (macOS/Linux, x64/arm64), cascading installation strategy (bun -> npm -> GitHub Releases tarball fallback), SHA-256 checksum verification, HTTPS-only downloads (`--proto '=https'` / `--https-only`), post-install verification via `micode-beads --version`, and clear error messages with next-step instructions. Supports `MICODE_VERSION` env var for pinned versions and `INSTALL_DIR` for custom install paths. Colors are conditionally applied only for TTY output.
    - **Deviations**: None
    - **Tests**: N/A (shell script; per design: "Do NOT test shell installer script in unit tests")

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [x] **T5**: Create verifier agent `[complexity:medium]`

    **Reference**: [design.md#34-new-agent-srcagentsverifierts](design.md#34-new-agent-srcagentsverifierts)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] `src/agents/verifier.ts` implements a new agent following the existing agent factory pattern
    - [x] Agent performs completeness check: every task in the plan has been addressed
    - [x] Agent performs test coverage check: every new/modified file has a corresponding test file
    - [x] Agent performs plan adherence check: files modified match the paths specified in the plan
    - [x] Agent performs test pass check: all tests pass via `bun test`
    - [x] Output follows the verification report markdown format specified in design (status, completeness table, coverage table, adherence table, test results, issues list)
    - [x] Verification failures produce actionable error messages identifying the specific gap

    **Implementation Summary**:

    - **Files**: `src/agents/verifier.ts`
    - **Approach**: Created new verifier agent following the existing AgentConfig pattern (matching reviewer.ts, implementer.ts). Agent uses XML-structured prompt with four named checks (completeness, test-coverage, plan-adherence, test-pass), a structured verification report markdown output format with tables for each check, severity levels (CRITICAL/WARNING/INFO), and actionable fix suggestions for every issue. Tools restricted to read-only (write: false, edit: false, task: false). Temperature set to 0.2 for deterministic verification.
    - **Deviations**: None
    - **Tests**: 56/56 agent tests passing; typecheck clean

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [x] **T6**: Create PR feedback agent `[complexity:medium]`

    **Reference**: [design.md#35-new-agent-srcagentspr-feedbackts](design.md#35-new-agent-srcagentspr-feedbackts)

    **Effort**: 6 hours

    **Acceptance Criteria**:

    - [x] `src/agents/pr-feedback.ts` implements a new agent following the existing agent factory pattern
    - [x] Agent uses `gh pr view <number> --json reviews,comments,reviewRequests` to fetch PR data via bash tool
    - [x] Agent parses review comments and maps them to file paths and line numbers
    - [x] Agent groups comments by file and generates correction tasks
    - [x] Agent spawns implementer agents in parallel to apply corrections
    - [x] Agent commits and pushes fixes to the existing PR branch (no force-push or history rewriting)
    - [x] Agent produces a summary of addressed vs. unaddressed review items

    **Implementation Summary**:

    - **Files**: `src/agents/pr-feedback.ts`
    - **Approach**: Created new PR feedback agent following the existing AgentConfig pattern (matching executor.ts, reviewer.ts). Agent uses XML-structured prompt with seven workflow phases (fetch, parse, group, plan, implement, commit, report). Uses gh CLI via bash tool for PR data fetching and gh api for inline review comments. Includes comment classification (actionable vs informational), parallel implementer spawning via spawn_agent, commit/push rules (no force-push), structured output format with addressed/unaddressed summary tables, and error handling for common scenarios (auth failure, PR not found, push failure). Temperature set to 0.2.
    - **Deviations**: None
    - **Tests**: 368/369 passing (1 pre-existing failure unrelated to this task)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [x] **T9**: Rewrite README following Standard Readme specification `[complexity:medium]`

    **Reference**: [design.md#310-readme-structure](design.md#310-readme-structure)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [x] README.md contains all required sections: project description, badges (CI, npm, license), quickstart (under 3 steps), installation, configuration, workflow overview, commands, AFK mode, stage resumption, agents table, tools table, hooks table, development (build/test/release), contributing, attribution, and license
    - [x] No text is copied verbatim from the upstream micode README
    - [x] Fork notice is reduced to a single attribution line under "Attribution"
    - [x] README is under 300 lines for the main content (excluding auto-generated tables)
    - [x] README follows the Standard Readme specification
    - [x] README is understandable by a developer with no prior knowledge of micode-beads

    **Implementation Summary**:

    - **Files**: `README.md`
    - **Approach**: Full rewrite from scratch following Standard Readme specification. 248 lines total. Sections: badges (CI, npm, license), description, install, quick start (3 steps), usage (workflow overview, commands, AFK mode, stage resumption), configuration (opencode.json, micode-beads.json with options table, research directories), agents table (28 agents), tools table (15 tools), hooks table (12 hooks), development (build, test, lint, release), contributing, attribution (single line), license.
    - **Deviations**: None
    - **Tests**: N/A (documentation-only change; 368/369 passing, 1 pre-existing failure unrelated)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ⏭️ N/A |

### Config-Dependent (Parallel Group 2)

- [x] **T3**: Create workflow state module with state machine, manager, and research-loader `[complexity:complex]`

    **Reference**: [design.md#31-new-module-srcworkflow](design.md#31-new-module-srcworkflow)

    **Effort**: 8 hours

    **Acceptance Criteria**:

    - [x] `src/workflow/state.ts` defines `WorkflowState`, `StageRecord`, and `CorrectionRecord` interfaces
    - [x] `src/workflow/manager.ts` implements `WorkflowManager` class with: `loadState`, `saveState`, `createState`, `startStage`, `completeStage`, `resetStage`, `getResumePoint`, `addCorrection`, `snapshotStage`, and static `detectAfkMode`
    - [x] `src/workflow/research-loader.ts` implements `loadResearchDocuments(dirs: string[])` returning `ResearchDocument[]` with path, content, and format
    - [x] `src/workflow/index.ts` provides barrel exports for all public APIs
    - [x] State persisted as JSON at `thoughts/workflow/{feature-slug}/state.json`
    - [x] Stage snapshots stored at `thoughts/workflow/{feature-slug}/snapshots/{stage}-v{N}/`
    - [x] Stage lifecycle transitions enforce valid state changes (pending -> running -> completed/failed)
    - [x] Stage versioning increments on each completion (version field in StageRecord)
    - [x] AFK detection resolves priority: command arg > env var (`MICODE_AFK`) > config flag
    - [x] Research-loader handles missing directories (warning, not error) and empty directories gracefully
    - [x] Research-loader supports `.md` and `.txt` file formats
    - [x] Reads `researchDirs` from config (requires T1 config schema)

    **Implementation Summary**:

    - **Files**: `src/workflow/state.ts`, `src/workflow/manager.ts`, `src/workflow/research-loader.ts`, `src/workflow/index.ts`
    - **Approach**: Created four-file workflow module following existing octto/state persistence patterns. `state.ts` defines all types (WorkflowState, StageRecord, CorrectionRecord, ResumeInfo, ResearchDocument) plus transition validation and factory functions. `manager.ts` implements WorkflowManager class with full stage lifecycle (start/complete/reset), resume logic, correction tracking with automatic downstream stage reset, snapshot persistence via cpSync, and static AFK detection with priority resolution (args > env > config). `research-loader.ts` loads .md/.txt files from configured directories with graceful missing/empty dir handling via log.warn. `index.ts` provides barrel exports. State persisted as JSON at `thoughts/workflow/{feature-slug}/state.json`, snapshots at `snapshots/{stage}-v{N}/`.
    - **Deviations**: None
    - **Tests**: 368/369 passing (1 pre-existing failure unrelated to this task)

    **Validation Summary**:

    | Dimension | Status |
    |-----------|--------|
    | Discipline | ✅ PASS |
    | Accuracy | ✅ PASS |
    | Completeness | ✅ PASS |
    | Quality | ✅ PASS |
    | Testing | ⏭️ N/A |
    | Commit | ✅ PASS |
    | Comments | ✅ PASS |

- [x] **T7**: Update agent prompts for AFK mode, stage resumption, enriched beads, research dirs, and verification `[complexity:complex]`

    **Reference**: [design.md#38-agent-prompt-updates](design.md#38-agent-prompt-updates)

    **Effort**: 8 hours

    **Acceptance Criteria**:

    - [x] Commander (`src/agents/commander.ts`): add `<afk-mode>` section (skip confirmations, auto-resolve, log choices), `<stage-resumption>` section (`--resume-from`, `--correct` flags), `<workflow-state>` section (state persistence), update `<workflow>` to include verify stage
    - [x] Brainstormer (`src/agents/brainstormer.ts`): add `<research-context>` section (configurable research dirs), add `<afk-mode>` section (skip Octto browser UI, auto-proceed)
    - [x] Planner (`src/agents/planner.ts`): update `<micro-task-design>` to require enriched bead descriptions (purpose statement, affected files with create/modify, dependencies with rationale, measurable done-criteria, reference to design/research docs), add bead quality validation step
    - [x] Executor (`src/agents/executor.ts`): add `<verification-phase>` after all batches (spawn verifier agent), add AFK mode awareness (no confirmation pauses), add workflow state updates (mark stages complete), add `<afk-git-pr>` section for automatic PR creation
    - [x] All prompt updates follow existing XML-structured agent prompt patterns
    - [x] Agent prompt updates reference new config fields from T1 and workflow state API from T3

    **Implementation Summary**:

    - **Files**: `src/agents/commander.ts`, `src/agents/brainstormer.ts`, `src/agents/planner.ts`, `src/agents/executor.ts`
    - **Approach**: Added XML-structured prompt sections to all four agents following existing patterns. Commander: `<workflow-state>`, `<stage-resumption>`, `<afk-mode>` sections plus verify phase in workflow and verifier/pr-feedback in agents list. Brainstormer: `<research-context>` for configurable research dirs and `<afk-mode>` for autonomous design. Planner: `<enriched-descriptions>` with required fields (Purpose, File, Depends, Done-Criteria, Design-Ref), good/bad examples, and `<quality-validation>` checklist; updated output templates. Executor: `<verification-phase>` with verifier spawning, `<afk-mode>`, `<workflow-state>`, `<afk-git-pr>` sections; added verifier to available-subagents and environment; updated output template with verification section.
    - **Deviations**: None
    - **Tests**: 368/369 passing (1 pre-existing failure unrelated to this task)

### Integration (Parallel Group 3)

- [ ] **T8**: Wire all new agents, commands, and hooks into src/index.ts `[complexity:medium]`

    **Reference**: [design.md#39-command-registration](design.md#39-command-registration)

    **Effort**: 4 hours

    **Acceptance Criteria**:

    - [ ] `src/index.ts` imports and registers the verifier agent from T5
    - [ ] `src/index.ts` imports and registers the PR feedback agent from T6
    - [ ] `src/index.ts` registers the `/review-feedback` command with description "Address PR review feedback" and template "Process review feedback for PR $ARGUMENTS"
    - [ ] `src/index.ts` imports the workflow module from T3
    - [ ] AFK detection integrated into plugin initialization using `WorkflowManager.detectAfkMode()`
    - [ ] `--afk`, `--resume-from`, and `--correct` flags parsed from `$ARGUMENTS` within agent prompts (not at CLI level)
    - [ ] All new imports resolve correctly and the project builds without errors

### Validation (Parallel Group 4)

- [ ] **T10**: Add comprehensive test suite for all new modules `[complexity:complex]`

    **Reference**: [design.md#7-testing-strategy](design.md#7-testing-strategy)

    **Effort**: 8 hours

    **Acceptance Criteria**:

    - [ ] `tests/config-loader.test.ts` extended: parse researchDirs, afk, gitPr; backward compat with existing configs; invalid value handling
    - [ ] `tests/workflow/state.test.ts` created: create, load, save state; stage transitions; version increment; correction records
    - [ ] `tests/workflow/manager.test.ts` created: resume logic; snapshot creation; affected stage detection
    - [ ] `tests/workflow/research-loader.test.ts` created: load .md/.txt files; missing dir warning; empty dir handling
    - [ ] `tests/cli/init.test.ts` created: dependency checks; config creation; idempotency; existing config merge
    - [ ] `tests/agents/verifier.test.ts` created: agent config validation; prompt structure verification
    - [ ] `tests/agents/pr-feedback.test.ts` created: agent config validation; prompt structure verification
    - [ ] `tests/workflow/afk.test.ts` created: env var detection, config flag, command arg detection; priority resolution
    - [ ] All tests pass with `bun test`
    - [ ] No tests written for: `gh` CLI behavior, OpenCode plugin SDK internals, shell installer, or Bun filesystem APIs

### User Docs

- [ ] **TD1**: Update .rp1/context/index.md - Project Structure `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/index.md

    **Section**: Project Structure

    **KB Source**: index.md:project-structure

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Project Structure section reflects the addition of `src/cli/` and `src/workflow/` directories

- [ ] **TD2**: Update .rp1/context/architecture.md - Data Flows `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/architecture.md

    **Section**: Data Flows

    **KB Source**: architecture.md:data-flows

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Data Flows section includes the workflow state flow and PR feedback flow

- [ ] **TD3**: Update .rp1/context/modules.md - Core Modules `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/modules.md

    **Section**: Core Modules

    **KB Source**: modules.md:core-modules

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Core Modules section documents the workflow module and CLI module

- [ ] **TD4**: Update .rp1/context/patterns.md - Extension Mechanisms `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/patterns.md

    **Section**: Extension Mechanisms

    **KB Source**: patterns.md:extension-mechanisms

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Extension Mechanisms section documents the AFK mode pattern and workflow state pattern

- [ ] **TD5**: Update .rp1/context/concept_map.md - Core Business Concepts `[complexity:simple]`

    **Reference**: [design.md#documentation-impact](design.md#9-documentation-impact)

    **Type**: edit

    **Target**: .rp1/context/concept_map.md

    **Section**: Core Business Concepts

    **KB Source**: concept_map.md:core-business-concepts

    **Effort**: 30 minutes

    **Acceptance Criteria**:

    - [ ] Core Business Concepts section includes WorkflowState, AFK Mode, and Stage Resumption concepts

## Acceptance Criteria Checklist

### FR-01: README Rewrite
- [ ] AC-01.1: README contains all required sections (description, badges, quickstart, install, config, workflow, commands, agents, tools, hooks, contributing, license)
- [ ] AC-01.2: No text copied verbatim from upstream micode README
- [ ] AC-01.3: Fork notice reduced to single attribution line
- [ ] AC-01.4: README under 300 lines for main content
- [ ] AC-01.5: README follows Standard Readme specification

### FR-02: CLI Onboarding/Init Tool
- [ ] AC-02.1: CLI command available and documented
- [ ] AC-02.2: Init checks for required dependencies (bun, opencode, git) and reports missing
- [ ] AC-02.3: Init creates or updates opencode.json to include plugin
- [ ] AC-02.4: Init optionally scaffolds .mindmodel/ directory
- [ ] AC-02.5: Init provides clear success/failure output with next steps
- [ ] AC-02.6: Init is idempotent

### FR-03: Installer Script
- [ ] AC-03.1: Single shell file hosted in repository
- [ ] AC-03.2: Detects OS and architecture
- [ ] AC-03.3: Fetches latest release from GitHub Releases API
- [ ] AC-03.4: Verifies downloaded artifact (checksum)
- [ ] AC-03.5: Places binary in standard PATH location
- [ ] AC-03.6: Clear error messages for unsupported platforms or network failures
- [ ] AC-03.7: Pipeable from curl

### FR-04: Bead Description Enrichment
- [ ] AC-04.1: Each bead includes purpose, file list, dependencies, done-criteria
- [ ] AC-04.2: Beads reference relevant research/design docs
- [ ] AC-04.3: Beads validated against quality threshold before implement

### FR-05: Configurable Research Document Source
- [ ] AC-05.1: Config option in micode-beads.json for research directories
- [ ] AC-05.2: Default directory is thoughts/shared/designs/
- [ ] AC-05.3: Custom directory contents provided as context to brainstormer and planner
- [ ] AC-05.4: Missing/empty directories handled gracefully (warning, not error)
- [ ] AC-05.5: Supports .md and .txt formats

### FR-06: Tightened Verification Stages
- [ ] AC-06.1: Completeness check (all bead tasks addressed)
- [ ] AC-06.2: Test coverage check (tests exist for new/modified code)
- [ ] AC-06.3: Plan adherence check (output matches plan file paths)
- [ ] AC-06.4: Actionable error messages for verification failures
- [ ] AC-06.5: Verification results logged to session ledger

### FR-07: Stage Resumption and Correction
- [ ] AC-07.1: Each stage persists outputs to durable filesystem location
- [ ] AC-07.2: --resume-from flag allows specifying target stage
- [ ] AC-07.3: Prior stages skipped and outputs loaded on resume
- [ ] AC-07.4: Correction message can be provided when resuming
- [ ] AC-07.5: Downstream stages re-executed with corrected inputs
- [ ] AC-07.6: Stage state versioned for change tracking

### FR-08: Post-PR-Review Feedback Workflow
- [ ] AC-08.1: Command accepts PR number or URL as input
- [ ] AC-08.2: Fetches review comments from GitHub API
- [ ] AC-08.3: Maps comments to specific files and lines
- [ ] AC-08.4: Generates corrective implementations
- [ ] AC-08.5: Commits and pushes to existing PR branch
- [ ] AC-08.6: Produces summary of addressed vs unaddressed items

### FR-09: Post-Final Correction Capability
- [ ] AC-09.1: --correct flag allows post-completion corrections
- [ ] AC-09.2: System determines affected stages
- [ ] AC-09.3: Only affected stages re-executed
- [ ] AC-09.4: Research docs amended, not rebuilt from scratch
- [ ] AC-09.5: Corrected plan includes diff/changelog
- [ ] AC-09.6: Corrections logged with timestamps and rationale

### FR-10: AFK (Autonomous) Mode
- [ ] AC-10.1: --afk flag accepted on main workflow command
- [ ] AC-10.2: All user prompts auto-resolved with conservative defaults
- [ ] AC-10.3: Auto-resolved decisions logged with rationale
- [ ] AC-10.4: Workflow completes without stdin reads or interactive pauses
- [ ] AC-10.5: Same artifact types produced as interactive mode
- [ ] AC-10.6: --afk combinable with other flags (e.g., --git-pr)

### FR-11: AFK + Git PR Combined Mode
- [ ] AC-11.1: --afk --git-pr creates branch, commits, pushes, opens PR
- [ ] AC-11.2: PR title and description auto-generated from plan
- [ ] AC-11.3: PR description includes design document summary
- [ ] AC-11.4: Existing PR updated rather than duplicated
- [ ] AC-11.5: PR created in draft status by default (configurable)

## Definition of Done

- [ ] All tasks completed
- [ ] All AC verified
- [ ] Code reviewed
- [ ] Docs updated
