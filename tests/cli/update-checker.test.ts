import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CHECK_INTERVAL_MS,
  displayUpdateNotice,
  isNewerVersion,
  readCache,
  shouldCheck,
  type UpdateCheckCache,
  writeCache,
} from "../../src/cli/update-checker";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "update-checker-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("readCache", () => {
  it("should return null when cache file does not exist", () => {
    const result = readCache(join(tempDir, "nonexistent.json"));
    expect(result).toBeNull();
  });

  it("should return parsed cache when file is valid", () => {
    const cachePath = join(tempDir, "cache.json");
    const cache: UpdateCheckCache = {
      lastCheck: Date.now(),
      latestVersion: "1.3.0",
      currentVersion: "1.2.0",
    };
    writeFileSync(cachePath, JSON.stringify(cache));

    const result = readCache(cachePath);
    expect(result).toEqual(cache);
  });

  it("should return null for malformed JSON", () => {
    const cachePath = join(tempDir, "cache.json");
    writeFileSync(cachePath, "not valid json{{{");

    const result = readCache(cachePath);
    expect(result).toBeNull();
  });

  it("should return null when required fields are missing", () => {
    const cachePath = join(tempDir, "cache.json");
    writeFileSync(cachePath, JSON.stringify({ lastCheck: 123 }));

    const result = readCache(cachePath);
    expect(result).toBeNull();
  });

  it("should return null when fields have wrong types", () => {
    const cachePath = join(tempDir, "cache.json");
    writeFileSync(
      cachePath,
      JSON.stringify({
        lastCheck: "not-a-number",
        latestVersion: 123,
        currentVersion: true,
      }),
    );

    const result = readCache(cachePath);
    expect(result).toBeNull();
  });

  it("should return valid cache with all required string and number fields", () => {
    const cachePath = join(tempDir, "cache.json");
    const cache = {
      lastCheck: 1700000000000,
      latestVersion: "2.0.0",
      currentVersion: "1.0.0",
    };
    writeFileSync(cachePath, JSON.stringify(cache));

    const result = readCache(cachePath);
    expect(result).not.toBeNull();
    expect(result?.lastCheck).toBe(1700000000000);
    expect(result?.latestVersion).toBe("2.0.0");
    expect(result?.currentVersion).toBe("1.0.0");
  });
});

describe("writeCache", () => {
  it("should write cache to the specified path", () => {
    const cachePath = join(tempDir, "cache.json");
    const cache: UpdateCheckCache = {
      lastCheck: Date.now(),
      latestVersion: "1.5.0",
      currentVersion: "1.4.0",
    };

    writeCache(cache, cachePath);

    const raw = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(cache);
  });

  it("should create parent directories if they do not exist", () => {
    const cachePath = join(tempDir, "nested", "deep", "cache.json");
    const cache: UpdateCheckCache = {
      lastCheck: Date.now(),
      latestVersion: "1.0.0",
      currentVersion: "1.0.0",
    };

    writeCache(cache, cachePath);

    const raw = readFileSync(cachePath, "utf-8");
    expect(JSON.parse(raw)).toEqual(cache);
  });

  it("should overwrite existing cache file", () => {
    const cachePath = join(tempDir, "cache.json");
    const oldCache: UpdateCheckCache = {
      lastCheck: 1000,
      latestVersion: "1.0.0",
      currentVersion: "1.0.0",
    };
    writeFileSync(cachePath, JSON.stringify(oldCache));

    const newCache: UpdateCheckCache = {
      lastCheck: 2000,
      latestVersion: "2.0.0",
      currentVersion: "1.0.0",
    };
    writeCache(newCache, cachePath);

    const raw = readFileSync(cachePath, "utf-8");
    expect(JSON.parse(raw)).toEqual(newCache);
  });
});

describe("shouldCheck", () => {
  it("should return true when cache is null", () => {
    expect(shouldCheck(null)).toBe(true);
  });

  it("should return true when cache is older than 24 hours", () => {
    const cache: UpdateCheckCache = {
      lastCheck: Date.now() - CHECK_INTERVAL_MS - 1000,
      latestVersion: "1.0.0",
      currentVersion: "1.0.0",
    };
    expect(shouldCheck(cache)).toBe(true);
  });

  it("should return false when cache is less than 24 hours old", () => {
    const cache: UpdateCheckCache = {
      lastCheck: Date.now() - CHECK_INTERVAL_MS + 60000,
      latestVersion: "1.0.0",
      currentVersion: "1.0.0",
    };
    expect(shouldCheck(cache)).toBe(false);
  });

  it("should return false when cache was just written", () => {
    const cache: UpdateCheckCache = {
      lastCheck: Date.now(),
      latestVersion: "1.0.0",
      currentVersion: "1.0.0",
    };
    expect(shouldCheck(cache)).toBe(false);
  });

  it("should return true when cache is exactly 24 hours old", () => {
    const cache: UpdateCheckCache = {
      lastCheck: Date.now() - CHECK_INTERVAL_MS - 1,
      latestVersion: "1.0.0",
      currentVersion: "1.0.0",
    };
    expect(shouldCheck(cache)).toBe(true);
  });
});

describe("isNewerVersion", () => {
  it("should return true when latest major is higher", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("should return true when latest minor is higher", () => {
    expect(isNewerVersion("1.2.0", "1.3.0")).toBe(true);
  });

  it("should return true when latest patch is higher", () => {
    expect(isNewerVersion("1.2.3", "1.2.4")).toBe(true);
  });

  it("should return false when versions are equal", () => {
    expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
  });

  it("should return false when current is newer", () => {
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("should handle v prefix in version strings", () => {
    expect(isNewerVersion("v1.0.0", "v2.0.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "v2.0.0")).toBe(true);
    expect(isNewerVersion("v1.0.0", "2.0.0")).toBe(true);
  });

  it("should return false when latest major is lower despite higher minor", () => {
    expect(isNewerVersion("2.0.0", "1.9.0")).toBe(false);
  });

  it("should return false when latest minor is lower despite higher patch", () => {
    expect(isNewerVersion("1.3.0", "1.2.9")).toBe(false);
  });

  it("should handle partial version strings", () => {
    expect(isNewerVersion("1", "2")).toBe(true);
    expect(isNewerVersion("1.0", "1.1")).toBe(true);
  });
});

describe("displayUpdateNotice", () => {
  let stderrOutput: string;
  const originalWrite = process.stderr.write;
  const originalIsTTY = process.stderr.isTTY;

  beforeEach(() => {
    stderrOutput = "";
    process.stderr.write = ((chunk: string) => {
      stderrOutput += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    Object.defineProperty(process.stderr, "isTTY", { value: originalIsTTY, configurable: true });
    delete process.env.NO_COLOR;
  });

  it("should include current and latest version in output", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    displayUpdateNotice("1.2.0", "1.3.0");
    expect(stderrOutput).toContain("1.2.0");
    expect(stderrOutput).toContain("1.3.0");
  });

  it("should include upgrade command in output", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    displayUpdateNotice("1.2.0", "1.3.0");
    expect(stderrOutput).toContain("bun add -g micode-beads@latest");
    expect(stderrOutput).toContain("npm update -g micode-beads");
  });

  it("should write to stderr", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    displayUpdateNotice("1.0.0", "2.0.0");
    expect(stderrOutput.length).toBeGreaterThan(0);
  });

  it("should not include ANSI codes when not a TTY", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    displayUpdateNotice("1.0.0", "2.0.0");
    expect(stderrOutput).not.toContain("\x1b[33m");
    expect(stderrOutput).not.toContain("\x1b[1m");
  });

  it("should not include ANSI codes when NO_COLOR is set", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.env.NO_COLOR = "1";
    displayUpdateNotice("1.0.0", "2.0.0");
    expect(stderrOutput).not.toContain("\x1b[33m");
  });
});

describe("checkForUpdates", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.MICODE_NO_UPDATE_CHECK = originalEnv.MICODE_NO_UPDATE_CHECK;
    if (!originalEnv.MICODE_NO_UPDATE_CHECK) {
      delete process.env.MICODE_NO_UPDATE_CHECK;
    }
  });

  it("should return immediately when MICODE_NO_UPDATE_CHECK is set", async () => {
    process.env.MICODE_NO_UPDATE_CHECK = "1";
    const { checkForUpdates } = await import("../../src/cli/update-checker");
    await checkForUpdates("1.0.0");
  });

  it("should not throw when cache does not exist", async () => {
    delete process.env.MICODE_NO_UPDATE_CHECK;
    const { checkForUpdates } = await import("../../src/cli/update-checker");
    await expect(checkForUpdates("1.0.0")).resolves.toBeUndefined();
  });
});
