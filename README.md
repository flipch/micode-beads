# micode-beads

[![CI](https://github.com/flipch/micode-beads/actions/workflows/ci.yml/badge.svg)](https://github.com/flipch/micode-beads/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/micode-beads.svg)](https://www.npmjs.com/package/micode-beads)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An [OpenCode](https://opencode.ai) plugin that turns AI coding into a structured **Brainstorm, Plan, Implement** workflow. Ships 26 specialized agents, 12 lifecycle hooks, project-aware constraint enforcement via `.mindmodel/`, and browser-based interactive brainstorming.

## Install

Use the installer script (recommended). It downloads a standalone binary when available, falling back to package managers automatically:

```bash
curl -fsSL https://raw.githubusercontent.com/flipch/micode-beads/main/scripts/install.sh | sh
```

Or install directly via a package manager (requires the [Bun](https://bun.sh) runtime):

```bash
bun add -g micode-beads
# or, if Bun is already on your PATH:
npm install -g micode-beads
```

After installing, verify your setup:

```bash
micode-beads doctor
```

Run `micode-beads doctor --fix` to auto-repair common issues (missing config, unregistered plugin, missing directories).

## Quick Start

1. Add the plugin to your OpenCode configuration (`~/.config/opencode/opencode.json`):

    ```json
    { "plugin": ["micode-beads"] }
    ```

2. Launch OpenCode in your project directory and run `/init` to scaffold project docs.

3. Describe your task and the commander agent takes over -- brainstorming designs, creating a plan, and implementing in parallel.

## Usage

### Workflow Overview

```
Brainstorm --> Plan --> Implement --> Verify
```

**Brainstorm** -- Explore ideas through collaborative questioning. Spawns research subagents in parallel. Optionally opens a browser-based interactive session (Octto). Produces a design document in `thoughts/shared/designs/`.

**Plan** -- Converts the design into a set of micro-tasks (2-5 min each) with exact file paths, dependencies, and TDD workflow. Outputs a plan to `thoughts/shared/plans/`.

**Implement** -- The executor orchestrates parallel implementer and reviewer agents across a git worktree. Each task follows test-first development, and completed work is verified against the plan.

**Verify** -- Cross-references the plan against actual implementation: completeness, test coverage, plan adherence, and passing tests. Failures produce actionable error messages.

### CLI Commands

| Command | Description |
|---------|-------------|
| `micode-beads init` | Initialize project: create `opencode.json`, scaffold `thoughts/` directories, run health checks |
| `micode-beads init --mindmodel` | Also scaffold `.mindmodel/` constraint directory |
| `micode-beads doctor` | Diagnose installation and environment health (11 checks across CLI, plugin, OpenCode, and config) |
| `micode-beads doctor --fix` | Attempt to auto-fix failed checks (create config, register plugin, scaffold directories) |
| `micode-beads doctor --json` | Output diagnostic results as machine-readable JSON |
| `micode-beads doctor --verbose` | Show detailed information for each check |

### OpenCode Commands

| Command | Description |
|---------|-------------|
| `/init` | Scaffold project documentation (ARCHITECTURE.md, CODE_STYLE.md) |
| `/mindmodel` | Generate `.mindmodel/` coding constraints from your codebase |
| `/ledger` | Create or update a continuity ledger for session state |
| `/search` | Full-text search across past plans, ledgers, and artifacts |
| `/review-feedback` | Ingest GitHub PR review comments and generate corrective fixes |

### AFK Mode

Run the entire workflow without human prompts. Useful for CI pipelines or overnight runs.

AFK mode is activated via any of (highest priority first):

1. Command argument: include `--afk` in your task message
2. Environment variable: `MICODE_AFK=1`
3. Config flag: `"afk": true` in `micode-beads.json`

Combine with `--git-pr` to automatically create a draft pull request when the workflow completes.

### Stage Resumption

Resume a workflow from any previously completed stage without re-running earlier work:

- `--resume-from=plan` -- skip brainstorm, re-run plan and everything after it
- `--correct "use JWT instead of sessions"` -- provide a correction when resuming

Stage outputs are persisted to `thoughts/workflow/` so they can be reloaded on resume. Each stage is versioned, letting you compare the original run against corrected runs.

## Configuration

### opencode.json

Set your default model and register the plugin:

```json
{
  "model": "provider/model-name",
  "plugin": ["micode-beads"]
}
```

All agents inherit the default model unless overridden.

### micode-beads.json

Create `~/.config/opencode/micode-beads.json` for per-agent overrides and feature flags:

```json
{
  "agents": {
    "brainstormer": { "model": "openai/gpt-4o", "temperature": 0.8 },
    "commander": { "maxTokens": 8192 }
  },
  "features": { "mindmodelInjection": true },
  "compactionThreshold": 0.5,
  "fragments": { "commander": ["custom-instructions.md"] },
  "researchDirs": ["docs"],
  "afk": false,
  "gitPr": { "draftByDefault": true }
}
```

Falls back to `micode.json` if `micode-beads.json` is not found.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agents` | object | -- | Per-agent overrides: `model`, `temperature`, `maxTokens`, `reasoningEffort`, `effort`, `thinking` |
| `features.mindmodelInjection` | boolean | `false` | Auto-inject `.mindmodel/` patterns into every message |
| `compactionThreshold` | number | `0.5` | Context usage ratio (0-1) that triggers auto-compaction |
| `fragments` | object | -- | Additional prompt fragment files per agent |
| `researchDirs` | string[] | `["thoughts/shared/designs/"]` | Directories scanned for existing research/design documents |
| `afk` | boolean | `false` | Enable autonomous mode by default |
| `methodology` | string | `"default"` | Development methodology profile (`"default"`, `"tdd"`) -- injects methodology-specific instructions into planner, executor, and implementer agents |
| `gitPr.draftByDefault` | boolean | `true` | Create PRs as drafts when using `--git-pr` |

Model resolution order: per-agent override > `opencode.json` default model > plugin default.

### Research Directories

The brainstormer and planner agents read existing documentation from configured directories. Point `researchDirs` at your project's docs folder to incorporate existing knowledge into the workflow. Missing or empty directories produce a warning, not an error.

## Agents

| Agent | Role |
|-------|------|
| commander | Primary orchestrator -- classifies tasks, routes to specialists |
| brainstormer | Design exploration via research subagents and Octto browser UI |
| planner | Converts designs into parallel micro-task plans |
| executor | Batch-spawns implementers and reviewers, orchestrates the implement phase |
| implementer | Executes a single micro-task with test-first development |
| reviewer | Reviews a single task for correctness, completeness, and style |
| verifier | Post-implementation cross-reference against the plan |
| pr-feedback | Ingests GitHub PR review comments and generates fixes |
| bootstrapper | Bootstraps new project scaffolding |
| probe | Lightweight investigation agent |
| octto | Manages interactive brainstorming sessions |
| codebase-locator | Finds relevant files for a given task |
| codebase-analyzer | Deep structural analysis of code |
| pattern-finder | Discovers existing code patterns |
| project-initializer | Generates ARCHITECTURE.md and CODE_STYLE.md |
| ledger-creator | Creates and updates continuity ledgers |
| artifact-searcher | Full-text search over indexed artifacts |
| mm-orchestrator | Coordinates the mindmodel generation pipeline |
| mm-stack-detector | Detects tech stack and frameworks |
| mm-pattern-discoverer | Discovers coding patterns in the codebase |
| mm-example-extractor | Extracts representative code examples |
| mm-constraint-writer | Assembles `.mindmodel/` constraint files |
| mm-constraint-reviewer | Reviews generated code against constraints |
| mm-dependency-mapper | Maps module dependencies |
| mm-convention-extractor | Extracts naming and style conventions |
| mm-domain-extractor | Identifies domain concepts |
| mm-code-clusterer | Clusters related code modules |
| mm-anti-pattern-detector | Flags anti-patterns in the codebase |

## Tools

| Tool | Description |
|------|-------------|
| `ast_grep_search` | AST-aware code pattern search |
| `ast_grep_replace` | AST-aware code pattern replacement |
| `look_at` | Extract file structure overview |
| `artifact_search` | Full-text search across indexed artifacts |
| `milestone_artifact_search` | Search milestone-specific artifacts |
| `btca_ask` | Query library source code |
| `mindmodel_lookup` | Query `.mindmodel/` patterns by keyword |
| `spawn_agent` | Spawn subagents in parallel |
| `batch_read` | Read multiple files in parallel |
| `pty_spawn` | Start a background terminal session |
| `pty_write` | Send input to a PTY session |
| `pty_read` | Read output from a PTY session |
| `pty_list` | List active PTY sessions |
| `pty_kill` | Terminate a PTY session |
| Octto tools | Create, await, and manage browser brainstorm sessions |

## Hooks

| Hook | Trigger | Purpose |
|------|---------|---------|
| Fragment Injector | `chat.params` | Injects user-defined prompt fragments (highest priority) |
| Ledger Loader | `chat.params` | Injects continuity ledger into system prompt |
| Context Injector | `chat.params` + `tool.execute.after` | Loads project context files and directory READMEs |
| Context Window Monitor | `chat.params` | Warns at 70% and 85% context usage thresholds |
| Mindmodel Injector | `chat.messages.transform` + `chat.system.transform` | Auto-injects matching `.mindmodel/` patterns (feature-flagged) |
| Auto-Compact | event | Summarizes session at configurable context threshold |
| Session Recovery | event | Recovers session state after interruptions |
| Token-Aware Truncation | `tool.execute.after` | Caps large tool outputs based on context limits |
| Comment Checker | `tool.execute.after` | Validates Edit tool output for placeholder comments |
| Artifact Auto-Index | `tool.execute.after` | Indexes artifacts written to `thoughts/` into SQLite FTS5 |
| File Ops Tracker | `tool.execute.after` | Records read/modified files for session ledger |
| Constraint Reviewer | `tool.execute.after` | Validates generated code against `.mindmodel/` constraints |

## Development

```bash
git clone git@github.com:flipch/micode-beads.git && cd micode-beads
bun install
```

Point OpenCode at your local clone for development:

```json
{ "plugin": ["~/path/to/micode-beads"] }
```

### Build

```bash
bun run build
```

### Test

```bash
bun test
```

### Lint and Format

```bash
bun run lint
bun run format
```

### Release

Releases are managed by [release-please](https://github.com/googleapis/release-please). Merge the release PR to cut a new version. The CI workflow publishes to npm via OIDC trusted publishing.

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request. Run `bun test` and `bun run lint` before pushing.

## Attribution

Forked from [micode](https://github.com/vtemian/micode) by vtemian.

## License

[MIT](LICENSE)
