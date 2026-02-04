# micode-beads

[![CI](https://github.com/flipch/micode-beads/actions/workflows/ci.yml/badge.svg)](https://github.com/flipch/micode-beads/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/micode-beads.svg)](https://www.npmjs.com/package/micode-beads)

OpenCode plugin with structured Brainstorm → Plan → Implement workflow, Beads task tracking, and session continuity.

https://github.com/user-attachments/assets/85236ad3-e78a-4ff7-a840-620f6ea2f512

## Quick Start

Add to `~/.config/opencode/opencode.json`:

```json
{ "plugin": ["micode-beads"] }
```

Then run `/init` to generate `ARCHITECTURE.md` and `CODE_STYLE.md`.

### Beads Setup

Install Beads and initialize it in your project so tasks can be tracked:

```bash
brew install beads
bd init
```

Ensure `bd` is on your PATH. The planner will create Beads tasks and the implementer will close them after tests pass.

## Workflow

```
Brainstorm → Plan → Implement
     ↓         ↓        ↓
  research  research  executor
```

### Brainstorm
Refine ideas into designs through collaborative questioning. Fires research subagents in parallel. Output: `thoughts/shared/designs/YYYY-MM-DD-{topic}-design.md`

### Plan  
Transform designs into implementation plans with bite-sized tasks (2-5 min each), exact file paths, and TDD workflow. Syncs tasks into Beads (epic + subtasks) and embeds Beads IDs in the plan. Output: `thoughts/shared/plans/YYYY-MM-DD-{topic}.md`

### Implement
Execute in git worktree for isolation. The **Executor** orchestrates implementer→reviewer cycles with parallel execution via fire-and-check pattern, using `bd ready` to pick tasks and `bd close` on success.

### Session Continuity
Maintain context across sessions with structured compaction. Run `/ledger` to create/update `thoughts/ledgers/CONTINUITY_{session}.md`.

## Commands

| Command | Description |
|---------|-------------|
| `/init` | Initialize project docs |
| `/ledger` | Create/update continuity ledger |
| `/search` | Search past plans and ledgers |

## Agents

| Agent | Purpose |
|-------|---------|
| commander | Orchestrator |
| brainstormer | Design exploration |
| planner | Implementation plans |
| executor | Orchestrate implement→review |
| implementer | Execute tasks |
| reviewer | Check correctness |
| codebase-locator | Find file locations |
| codebase-analyzer | Deep code analysis |
| pattern-finder | Find existing patterns |
| project-initializer | Generate project docs |
| ledger-creator | Continuity ledgers |
| artifact-searcher | Search past work |

## Tools

| Tool | Description |
|------|-------------|
| `ast_grep_search` | AST-aware code pattern search |
| `ast_grep_replace` | AST-aware code pattern replacement |
| `look_at` | Extract file structure |
| `artifact_search` | Search past plans/ledgers |
| `btca_ask` | Query library source code |
| `pty_spawn` | Start background terminal session |
| `pty_write` | Send input to PTY |
| `pty_read` | Read PTY output |
| `pty_list` | List PTY sessions |
| `pty_kill` | Terminate PTY |

## Hooks

- **Think Mode** - Keywords like "think hard" enable 32k token thinking budget
- **Ledger Loader** - Injects continuity ledger into system prompt
- **Auto-Compact** - At 50% context usage, automatically summarizes session to reduce context
- **File Ops Tracker** - Tracks read/write/edit for deterministic logging
- **Artifact Auto-Index** - Indexes artifacts in thoughts/ directories
- **Context Injector** - Injects ARCHITECTURE.md, CODE_STYLE.md
- **Token-Aware Truncation** - Truncates large tool outputs

## Configuration

### Model Configuration

micode-beads reads your default model from `opencode.json`:

```json
{
  "model": "github-copilot/gpt-5-mini",
  "plugin": ["micode-beads"]
}
```

All micode-beads agents will use this model automatically.

### micode-beads.json

Create `~/.config/opencode/micode-beads.json` for micode-beads-specific settings:

```json
{
  "agents": {
    "brainstormer": { "model": "openai/gpt-4o", "temperature": 0.8 },
    "commander": { "maxTokens": 8192 }
  },
  "features": {
    "mindmodelInjection": true
  },
  "compactionThreshold": 0.5,
  "fragments": {
    "commander": ["custom-instructions.md"]
  }
}
```

If `micode-beads.json` is missing, the plugin falls back to `micode.json` for compatibility.

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `agents` | object | Per-agent overrides (model, temperature, maxTokens) |
| `features.mindmodelInjection` | boolean | Enable mindmodel context injection |
| `compactionThreshold` | number | Context usage threshold (0-1) for auto-compaction. Default: 0.5 |
| `fragments` | object | Additional prompt fragments per agent |

#### Model Resolution Priority

1. Per-agent override in `micode-beads.json` (highest)
2. Default model from `opencode.json` `"model"` field
3. Plugin default (fallback)

#### Model Syntax

Models use `provider/model` format. The provider must match exactly what's in your `opencode.json`:

```json
{
  "provider": {
    "github-copilot": {
      "models": { "gpt-5-mini": {} }
    }
  }
}
```

Use `"model": "github-copilot/gpt-5-mini"` (not `github/copilot:gpt-5-mini`).

## Development

```bash
git clone git@github.com:flipch/micode-beads.git ~/.micode-beads
cd ~/.micode-beads && bun install && bun run build
```

```json
// Use local path
{ "plugin": ["~/.micode-beads"] }
```

### Release

Release checklist:

- Ensure npm Trusted Publishing is set for `flipch/micode-beads` and GitHub repo variable `NPM_PUBLISH_OIDC=true` exists.
- Run tests and build: `bin/bun test` and `bin/bun run build`.
- Bump version (creates commit + tag): `bin/bun run version:patch` (or `version:minor`, `version:major`).
- Push commit and tag: `git push origin main --follow-tags`.
- Create a GitHub Release for the tag (this triggers npm publish via OIDC).
- Verify the version appears on npm.

Semver bump commands:

```bash
bin/bun run version:patch
bin/bun run version:minor
bin/bun run version:major
bin/bun run version:prerelease
```

## Philosophy

1. **Brainstorm first** - Refine ideas before coding
2. **Research before implementing** - Understand the codebase
3. **Plan with human buy-in** - Get approval before coding
4. **Parallel investigation** - Spawn multiple subagents
5. **Isolated implementation** - Use git worktrees
6. **Continuous verification** - Implementer + Reviewer per task
7. **Session continuity** - Never lose context

## micode-beads vs oh-my-opencode

Both are OpenCode plugins, but with different philosophies:

| Aspect | micode-beads | oh-my-opencode |
|--------|--------|----------------|
| **Philosophy** | Opinionated workflow (brainstorm→plan→implement) | Batteries-included framework |
| **Agent Design** | Role-based (Brainstormer, Planner, Executor) | Greek mythology theme (Sisyphus, Atlas, Prometheus) |
| **Parallelism** | Batch-first: 10-20 concurrent micro-tasks (2-5 min each) | Background tasks with tmux visual monitoring |
| **Code Guidance** | Mindmodel system with project-specific patterns | Comment checker, keyword modes (ultrawork) |
| **Context Recovery** | Ledger system (CONTINUITY files) | AGENTS.md hierarchy, preemptive compaction |
| **Workflow** | TDD-enforced with adaptation over escalation | Category-based delegation (visual-engineering, ultrabrain) |
| **Configuration** | Focused options | Extensive (34 hooks, 11 agents, fallback chains) |

### When to Choose micode-beads

- You want a **structured brainstorm→plan→implement workflow**
- You prefer **TDD-driven implementation** with test-first development
- You need **project-specific pattern enforcement** via mindmodel
- You want **high parallelism on granular tasks** (10-20 concurrent micro-tasks)
- You value **session continuity** via structured ledgers
- You want **Beads-backed task tracking** across long-running work

### When to Choose oh-my-opencode

- You want **maximum flexibility** and configuration options
- You prefer **keyword-driven modes** (e.g., "ultrawork", "analyze")
- You need **extensive model fallback chains** with subscription detection
- You like **category-based task delegation** (visual-engineering, infrastructure)
- You want **visual monitoring** via tmux integration

## Inspiration

- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) - Plugin architecture
- [HumanLayer ACE-FCA](https://github.com/humanlayer/12-factor-agents) - Structured workflows
- [Factory.ai](https://factory.ai/blog/context-compression) - Structured compaction research
