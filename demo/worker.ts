/**
 * Worker process: executes a single micro-task using canned mock LLM responses.
 * Receives task JSON as argv[2] and writes the generated file to the output directory.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { generateResponse, type TaskDef } from "./mock-llm/responses";

const SIMULATED_DELAY_MIN_MS = 30;
const SIMULATED_DELAY_MAX_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const taskJson = process.argv[2];
  const outputDir = process.argv[3];

  if (!taskJson || !outputDir) {
    process.stderr.write("Usage: bun run worker.ts <task-json> <output-dir>\n");
    process.exit(1);
  }

  let task: TaskDef;
  try {
    task = JSON.parse(taskJson) as TaskDef;
  } catch {
    process.stderr.write(`Failed to parse task JSON: ${taskJson}\n`);
    process.exit(1);
  }

  const delay = SIMULATED_DELAY_MIN_MS + Math.random() * (SIMULATED_DELAY_MAX_MS - SIMULATED_DELAY_MIN_MS);
  await sleep(delay);

  const content = generateResponse(task);

  const outputPath = join(outputDir, task.outputFile);
  const dir = dirname(outputPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, content, "utf-8");

  const result = {
    taskId: task.id,
    status: "success",
    outputFile: task.outputFile,
    durationMs: Math.round(delay),
    bytesWritten: Buffer.byteLength(content, "utf-8"),
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Worker error: ${err}\n`);
  process.exit(1);
});
