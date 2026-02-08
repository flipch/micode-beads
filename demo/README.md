# micode-beads Demo: 100-Agent Snake Game Stress Test

A stress test that orchestrates approximately 100 parallel agents to build a complete terminal-based snake game. Each agent is a Bun subprocess that receives a micro-task, generates code from canned mock LLM responses, and writes the output file.

## Quick Start

```bash
cd demo
bun run start
```

Or from the project root:

```bash
bun run demo/orchestrator.ts
```

## What It Does

1. Reads `task-manifest.json` containing ~100 micro-tasks decomposing a snake game
2. Spawns one Bun worker subprocess per task (default: 100 concurrent)
3. Each worker simulates LLM-driven code generation using canned responses
4. Workers write generated files to `output/`
5. The orchestrator reports real-time progress and a final summary

The demo validates that your local environment can handle parallel agent workloads similar to what micode-beads orchestrates in real workflows.

## Options

```
bun run orchestrator.ts [options]

Options:
  --concurrency <n>   Max parallel workers (default: 100)
  --output <dir>      Output directory (default: ./output)
  --no-clean          Don't clean output directory before run
  --help, -h          Show this help message
```

### Examples

```bash
# Default: 100 parallel agents
bun run orchestrator.ts

# Conservative: 50 parallel agents
bun run orchestrator.ts --concurrency 50

# Custom output directory
bun run orchestrator.ts --output /tmp/snake-demo
```

## Task Breakdown

The snake game is decomposed into ~100 micro-tasks across these categories:

| Category | Count | Examples |
|----------|-------|---------|
| Core game logic | 15 | Game loop, snake movement, collision detection, food spawning |
| Rendering | 10 | Terminal renderer, grid drawing, color system, score display |
| Input handling | 8 | Keyboard input, direction mapping, input buffering |
| Game state | 12 | State management, score tracking, high scores, difficulty levels |
| Data structures | 10 | Position math, grid representation, ring buffer, bounds |
| Tests | 25 | Unit tests for each core module |
| Configuration | 8 | Game config, difficulty presets, keybindings, colors |
| Documentation | 7 | README, architecture doc, API references |
| Build/tooling | 5 | package.json, tsconfig, build scripts |

## Architecture

```
orchestrator.ts          Reads manifest, spawns workers, reports progress
    |
    +-- worker.ts        One per task: receives JSON, writes output file
    |     |
    |     +-- mock-llm/responses.ts    Maps task types to template content
    |           |
    |           +-- mock-llm/templates/*.tmpl   Code/doc templates
    |
    +-- task-manifest.json    ~100 task definitions
    |
    +-- output/               Generated snake game files (gitignored)
```

### Signal Handling

The orchestrator handles graceful shutdown:

- **SIGINT** (Ctrl+C): Sends SIGTERM to all active workers
- **SIGTERM**: Same behavior as SIGINT
- After 5 seconds, any remaining workers receive SIGKILL
- A partial summary is printed on early termination

## System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4 GB | 8 GB |
| CPU cores | 2 | 4+ |
| Bun version | 1.0+ | 1.2+ |
| Disk space | 50 MB | 100 MB |

The demo spawns ~100 subprocesses. On resource-constrained machines, reduce concurrency:

```bash
bun run orchestrator.ts --concurrency 25
```

## Expected Output

```
=== micode-beads Demo: 100-Agent Snake Game Stress Test ===

Project:     snake-game
Description: Terminal-based classic snake game built by ~100 parallel agents
Tasks:       100
Concurrency: 100
Output:      /path/to/demo/output

Task Breakdown:
  build           ###  5
  config          ####  8
  core            ########  15
  data            #####  10
  docs            ####  7
  input           ####  8
  rendering       #####  10
  state           ######  12
  test            #############  25

[==============================] 100% 100 done 0 active 2.1s

=== Results ===

Total tasks:       100
Completed:         100
Failed:            0
Total time:        2.1s
Avg task time:     189ms
Tasks/second:      47.6
Output size:       234.5KB
Peak memory:       89.2MB
Output dir:        /path/to/demo/output

Results by category:
  build           5
  config          8
  core            15
  data            10
  docs            7
  input           8
  rendering       10
  state           12
  test            25

All tasks completed successfully.
```

## Output Structure

After running, the `output/` directory contains a complete snake game project:

```
output/
  src/
    main.ts
    game-loop.ts
    snake.ts
    food.ts
    collision/
    renderer/
    input/
    state/
    data/
    config/
  tests/
  docs/
  README.md
  package.json
  tsconfig.json
```

## Troubleshooting

**"Too many open files"**: Reduce concurrency with `--concurrency 50` or increase your system's file descriptor limit (`ulimit -n 4096`).

**Slow performance**: The demo is CPU-bound when spawning many subprocesses. Reduce concurrency to match your available cores.

**Out of memory**: Each worker uses ~20-50MB of heap. With 100 concurrent workers, expect ~2-4GB total. Reduce concurrency if your machine has less than 4GB available RAM.
