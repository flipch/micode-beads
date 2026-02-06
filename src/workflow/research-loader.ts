// src/workflow/research-loader.ts
// Load research documents from configured directories
// Supports .md and .txt files with graceful handling of missing/empty directories

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { log } from "../utils/logger";
import type { ResearchDocument } from "./state";

const MODULE = "workflow.research";

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt"]);

function getFormat(fileName: string): "md" | "txt" | null {
  if (fileName.endsWith(".md")) return "md";
  if (fileName.endsWith(".txt")) return "txt";
  return null;
}

export async function loadResearchDocuments(dirs: string[], projectRoot?: string): Promise<ResearchDocument[]> {
  const documents: ResearchDocument[] = [];
  const root = projectRoot ? resolve(projectRoot) : resolve(process.cwd());

  for (const dir of dirs) {
    const resolvedDir = resolve(root, dir);
    if (!resolvedDir.startsWith(root)) {
      log.warn(MODULE, `Research directory escapes project root, skipping: ${dir}`);
      continue;
    }

    if (!existsSync(resolvedDir)) {
      log.warn(MODULE, `Research directory not found: ${resolvedDir}`);
      continue;
    }

    let entries: string[];
    try {
      entries = readdirSync(resolvedDir);
    } catch (e) {
      log.warn(
        MODULE,
        `Failed to read research directory ${resolvedDir}: ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    const files = entries.filter((name) => {
      const ext = name.lastIndexOf(".") >= 0 ? name.slice(name.lastIndexOf(".")) : "";
      return SUPPORTED_EXTENSIONS.has(ext);
    });

    if (files.length === 0) {
      log.debug(MODULE, `No research documents found in ${resolvedDir}`);
      continue;
    }

    for (const file of files) {
      const filePath = join(resolvedDir, file);
      const format = getFormat(file);
      if (!format) continue;

      try {
        const content = await Bun.file(filePath).text();
        documents.push({ path: filePath, content, format });
      } catch (e) {
        log.warn(MODULE, `Failed to read research document ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  log.debug(MODULE, `Loaded ${documents.length} research document(s) from ${dirs.length} director(ies)`);
  return documents;
}
