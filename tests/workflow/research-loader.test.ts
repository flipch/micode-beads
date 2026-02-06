import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadResearchDocuments } from "../../src/workflow/research-loader";

describe("loadResearchDocuments", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "research-loader-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should load .md files from a directory", async () => {
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir);
    writeFileSync(join(docsDir, "design.md"), "# Design Document");

    const docs = await loadResearchDocuments([docsDir]);

    expect(docs.length).toBe(1);
    expect(docs[0].content).toBe("# Design Document");
    expect(docs[0].format).toBe("md");
    expect(docs[0].path).toBe(join(docsDir, "design.md"));
  });

  it("should load .txt files from a directory", async () => {
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir);
    writeFileSync(join(docsDir, "notes.txt"), "Some notes");

    const docs = await loadResearchDocuments([docsDir]);

    expect(docs.length).toBe(1);
    expect(docs[0].content).toBe("Some notes");
    expect(docs[0].format).toBe("txt");
  });

  it("should skip unsupported file extensions", async () => {
    const docsDir = join(tmpDir, "docs");
    mkdirSync(docsDir);
    writeFileSync(join(docsDir, "design.md"), "# Design");
    writeFileSync(join(docsDir, "image.png"), "binary");
    writeFileSync(join(docsDir, "data.json"), "{}");

    const docs = await loadResearchDocuments([docsDir]);

    expect(docs.length).toBe(1);
    expect(docs[0].format).toBe("md");
  });

  it("should load files from multiple directories", async () => {
    const dir1 = join(tmpDir, "docs");
    const dir2 = join(tmpDir, "wiki");
    mkdirSync(dir1);
    mkdirSync(dir2);
    writeFileSync(join(dir1, "a.md"), "Doc A");
    writeFileSync(join(dir2, "b.txt"), "Doc B");

    const docs = await loadResearchDocuments([dir1, dir2]);

    expect(docs.length).toBe(2);
  });

  it("should handle missing directories gracefully", async () => {
    const docs = await loadResearchDocuments([join(tmpDir, "nonexistent")]);

    expect(docs).toEqual([]);
  });

  it("should handle empty directories gracefully", async () => {
    const emptyDir = join(tmpDir, "empty");
    mkdirSync(emptyDir);

    const docs = await loadResearchDocuments([emptyDir]);

    expect(docs).toEqual([]);
  });

  it("should continue loading when one directory is missing", async () => {
    const validDir = join(tmpDir, "valid");
    mkdirSync(validDir);
    writeFileSync(join(validDir, "doc.md"), "Content");

    const docs = await loadResearchDocuments([join(tmpDir, "missing"), validDir]);

    expect(docs.length).toBe(1);
    expect(docs[0].content).toBe("Content");
  });

  it("should handle empty dirs array", async () => {
    const docs = await loadResearchDocuments([]);

    expect(docs).toEqual([]);
  });
});
