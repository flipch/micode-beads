/**
 * Orchestrator: spawns ~100 parallel workers to build a snake game.
 * Reads task-manifest.json, spawns Bun subprocesses, reports progress, handles signals.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { TaskDef } from "./mock-llm/responses";

interface TaskManifest {
  project: string;
  description: string;
  tasks: TaskDef[];
}

interface TaskResult {
  taskId: string;
  status: "success" | "failed";
  outputFile: string;
  durationMs: number;
  bytesWritten: number;
  error?: string;
}

interface OrchestratorOptions {
  concurrency: number;
  outputDir: string;
  clean: boolean;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  clearLine: "\x1b[2K\r",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(0);
  return `${minutes}m${seconds}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function parseArgs(): OrchestratorOptions {
  const args = process.argv.slice(2);
  const options: OrchestratorOptions = {
    concurrency: 100,
    outputDir: join(import.meta.dir, "output"),
    clean: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--concurrency" && args[i + 1]) {
      options.concurrency = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--output" && args[i + 1]) {
      options.outputDir = args[i + 1];
      i++;
    } else if (arg === "--no-clean") {
      options.clean = false;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) {
    console.error(`Invalid --concurrency value. Must be a positive integer.`);
    printUsage();
    process.exit(1);
  }

  return options;
}

function printUsage(): void {
  console.log(`
${ANSI.bold}micode-beads Demo: 100-Agent Snake Game Stress Test${ANSI.reset}

${ANSI.cyan}Usage:${ANSI.reset}
  bun run orchestrator.ts [options]

${ANSI.cyan}Options:${ANSI.reset}
  --concurrency <n>   Max parallel workers (default: 100)
  --output <dir>      Output directory (default: ./output)
  --no-clean          Don't clean output directory before run
  --help, -h          Show this help message

${ANSI.cyan}Examples:${ANSI.reset}
  bun run orchestrator.ts                    # Default: 100 parallel agents
  bun run orchestrator.ts --concurrency 50   # Limit to 50 parallel agents
  bun run orchestrator.ts --no-clean         # Keep previous output
`);
}

function printBanner(manifest: TaskManifest, options: OrchestratorOptions): void {
  const categories = new Map<string, number>();
  for (const task of manifest.tasks) {
    categories.set(task.category, (categories.get(task.category) ?? 0) + 1);
  }

  console.log(`
${ANSI.bold}${ANSI.cyan}=== micode-beads Demo: 100-Agent Snake Game Stress Test ===${ANSI.reset}

${ANSI.bold}Project:${ANSI.reset}     ${manifest.project}
${ANSI.bold}Description:${ANSI.reset} ${manifest.description}
${ANSI.bold}Tasks:${ANSI.reset}       ${manifest.tasks.length}
${ANSI.bold}Concurrency:${ANSI.reset} ${options.concurrency}
${ANSI.bold}Output:${ANSI.reset}      ${options.outputDir}

${ANSI.bold}Task Breakdown:${ANSI.reset}`);

  for (const [cat, count] of [...categories.entries()].sort()) {
    const bar = "\u2588".repeat(Math.ceil(count / 2));
    console.log(`  ${ANSI.dim}${cat.padEnd(15)}${ANSI.reset} ${ANSI.blue}${bar}${ANSI.reset} ${count}`);
  }
  console.log();
}

class Orchestrator {
  private manifest: TaskManifest;
  private options: OrchestratorOptions;
  private results: TaskResult[] = [];
  private activeProcesses = new Set<ReturnType<typeof Bun.spawn>>();
  private startTime = 0;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;
  private completed = 0;
  private failed = 0;
  private totalBytes = 0;

  constructor(manifest: TaskManifest, options: OrchestratorOptions) {
    this.manifest = manifest;
    this.options = options;
  }

  async run(): Promise<void> {
    this.setupOutputDir();
    this.setupSignalHandlers();

    printBanner(this.manifest, this.options);

    this.startTime = performance.now();
    this.startProgressReporting();

    try {
      await this.spawnWorkers();
    } finally {
      this.stopProgressReporting();
      this.printSummary();
    }
  }

  private setupOutputDir(): void {
    if (this.options.clean && existsSync(this.options.outputDir)) {
      rmSync(this.options.outputDir, { recursive: true, force: true });
    }
    mkdirSync(this.options.outputDir, { recursive: true });
  }

  private setupSignalHandlers(): void {
    const shutdown = (signal: string) => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;

      console.log(
        `\n${ANSI.yellow}Received ${signal}. Shutting down ${this.activeProcesses.size} workers...${ANSI.reset}`,
      );

      for (const proc of this.activeProcesses) {
        proc.kill("SIGTERM");
      }

      setTimeout(() => {
        for (const proc of this.activeProcesses) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }

  private startProgressReporting(): void {
    this.progressInterval = setInterval(() => {
      this.reportProgress();
    }, 1000);
  }

  private stopProgressReporting(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private reportProgress(): void {
    const elapsed = performance.now() - this.startTime;
    const total = this.manifest.tasks.length;
    const done = this.completed + this.failed;
    const pct = Math.round((done / total) * 100);
    const active = this.activeProcesses.size;

    const bar = this.buildProgressBar(pct);

    process.stdout.write(
      `${ANSI.clearLine}${bar} ${ANSI.bold}${pct}%${ANSI.reset} ` +
        `${ANSI.green}${this.completed} done${ANSI.reset} ` +
        `${this.failed > 0 ? `${ANSI.red}${this.failed} failed${ANSI.reset} ` : ""}` +
        `${ANSI.dim}${active} active${ANSI.reset} ` +
        `${ANSI.dim}${formatDuration(Math.round(elapsed))}${ANSI.reset}`,
    );
  }

  private buildProgressBar(pct: number): string {
    const width = 30;
    const filled = Math.round((pct / 100) * width);
    const empty = width - filled;
    return `${ANSI.cyan}[${"=".repeat(filled)}${filled < width ? ">" : ""}${" ".repeat(Math.max(0, empty - 1))}]${ANSI.reset}`;
  }

  private async spawnWorkers(): Promise<void> {
    const tasks = [...this.manifest.tasks];
    let nextIndex = 0;

    const runNext = async (): Promise<void> => {
      while (nextIndex < tasks.length && !this.shuttingDown) {
        const task = tasks[nextIndex++];
        await this.runWorker(task);
      }
    };

    const poolSize = Math.min(this.options.concurrency, tasks.length);
    const workers = Array.from({ length: poolSize }, () => runNext());
    await Promise.allSettled(workers);
  }

  private async runWorker(task: TaskDef): Promise<void> {
    const taskJson = JSON.stringify(task);
    const workerPath = join(import.meta.dir, "worker.ts");

    const proc = Bun.spawn(["bun", "run", workerPath, taskJson, this.options.outputDir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    this.activeProcesses.add(proc);
    const taskStart = performance.now();

    try {
      const exitCode = await proc.exited;
      const durationMs = Math.round(performance.now() - taskStart);

      if (exitCode === 0) {
        let result: TaskResult;
        try {
          const stdout = await new Response(proc.stdout).text();
          result = JSON.parse(stdout.trim()) as TaskResult;
        } catch {
          result = {
            taskId: task.id,
            status: "success",
            outputFile: task.outputFile,
            durationMs,
            bytesWritten: 0,
          };
        }
        this.results.push(result);
        this.completed++;
        this.totalBytes += result.bytesWritten;
      } else {
        const stderr = await new Response(proc.stderr).text();
        this.results.push({
          taskId: task.id,
          status: "failed",
          outputFile: task.outputFile,
          durationMs,
          bytesWritten: 0,
          error: stderr.trim().slice(0, 200),
        });
        this.failed++;
      }
    } catch (err) {
      this.results.push({
        taskId: task.id,
        status: "failed",
        outputFile: task.outputFile,
        durationMs: Math.round(performance.now() - taskStart),
        bytesWritten: 0,
        error: String(err),
      });
      this.failed++;
    } finally {
      this.activeProcesses.delete(proc);
    }
  }

  private printSummary(): void {
    const elapsed = performance.now() - this.startTime;
    const total = this.manifest.tasks.length;
    const done = this.completed + this.failed;
    const durations = this.results.filter((r) => r.status === "success").map((r) => r.durationMs);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const peakMemory = process.memoryUsage().heapUsed;

    console.log(`\n
${ANSI.bold}${ANSI.cyan}=== Results ===${ANSI.reset}

${ANSI.bold}Total tasks:${ANSI.reset}       ${total}
${ANSI.bold}Completed:${ANSI.reset}         ${ANSI.green}${this.completed}${ANSI.reset}
${ANSI.bold}Failed:${ANSI.reset}            ${this.failed > 0 ? `${ANSI.red}${this.failed}${ANSI.reset}` : "0"}
${ANSI.bold}Total time:${ANSI.reset}        ${formatDuration(Math.round(elapsed))}
${ANSI.bold}Avg task time:${ANSI.reset}     ${formatDuration(Math.round(avgDuration))}
${ANSI.bold}Tasks/second:${ANSI.reset}      ${(done / (elapsed / 1000)).toFixed(1)}
${ANSI.bold}Output size:${ANSI.reset}       ${formatBytes(this.totalBytes)}
${ANSI.bold}Peak memory:${ANSI.reset}       ${formatBytes(peakMemory)}
${ANSI.bold}Output dir:${ANSI.reset}        ${this.options.outputDir}
`);

    if (this.failed > 0) {
      console.log(`${ANSI.red}${ANSI.bold}Failed tasks:${ANSI.reset}`);
      for (const result of this.results.filter((r) => r.status === "failed")) {
        console.log(`  ${ANSI.red}x${ANSI.reset} ${result.taskId}: ${result.error ?? "unknown error"}`);
      }
      console.log();
    }

    const byCategory = new Map<string, { success: number; failed: number }>();
    for (const result of this.results) {
      const task = this.manifest.tasks.find((t) => t.id === result.taskId);
      if (!task) continue;
      const entry = byCategory.get(task.category) ?? { success: 0, failed: 0 };
      if (result.status === "success") entry.success++;
      else entry.failed++;
      byCategory.set(task.category, entry);
    }

    console.log(`${ANSI.bold}Results by category:${ANSI.reset}`);
    for (const [cat, counts] of [...byCategory.entries()].sort()) {
      const status =
        counts.failed > 0
          ? `${ANSI.green}${counts.success}${ANSI.reset}/${ANSI.red}${counts.failed}${ANSI.reset}`
          : `${ANSI.green}${counts.success}${ANSI.reset}`;
      console.log(`  ${cat.padEnd(15)} ${status}`);
    }

    console.log(
      `\n${this.failed === 0 ? `${ANSI.green}${ANSI.bold}All tasks completed successfully.${ANSI.reset}` : `${ANSI.yellow}${ANSI.bold}Completed with ${this.failed} failure(s).${ANSI.reset}`}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  const manifestPath = join(import.meta.dir, "task-manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Task manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as TaskManifest;

  const orchestrator = new Orchestrator(manifest, options);
  await orchestrator.run();
}

main().catch((err) => {
  console.error(`Orchestrator error: ${err}`);
  process.exit(1);
});
