// src/workflow/research-loader.ts
// Load research documents from configured directories
// Supports .md and .txt files with graceful handling of missing/empty directories

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { log } from "../utils/logger";
import type { ResearchDocument } from "./state";

const MODULE = "workflow.research";

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt"]);

function getFormat(fileName: string): "md" | "txt" | null {
  if (fileName.endsWith(".md")) return "md";
  if (fileName.endsWith(".txt")) return "txt";
  return null;
}

export async function loadResearchDocuments(dirs: string[]): Promise<ResearchDocument[]> {
  const documents: ResearchDocument[] = [];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      log.warn(MODULE, `Research directory not found: ${dir}`);
      continue;
    }

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (e) {
      log.warn(MODULE, `Failed to read research directory ${dir}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const files = entries.filter((name) => {
      const ext = name.lastIndexOf(".") >= 0 ? name.slice(name.lastIndexOf(".")) : "";
      return SUPPORTED_EXTENSIONS.has(ext);
    });

    if (files.length === 0) {
      log.debug(MODULE, `No research documents found in ${dir}`);
      continue;
    }

    for (const file of files) {
      const filePath = join(dir, file);
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
