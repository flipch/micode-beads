import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string;
  currentVersion: string;
}

export const CACHE_PATH = join(homedir(), ".cache", "micode-beads", "update-check.json");
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const GITHUB_REPO = "flipch/micode-beads";

export function readCache(cachePath: string = CACHE_PATH): UpdateCheckCache | null {
  try {
    if (!existsSync(cachePath)) return null;
    const raw = readFileSync(cachePath, "utf-8");
    const data = JSON.parse(raw);
    if (
      typeof data.lastCheck !== "number" ||
      typeof data.latestVersion !== "string" ||
      typeof data.currentVersion !== "string"
    ) {
      return null;
    }
    return data as UpdateCheckCache;
  } catch {
    return null;
  }
}

export function writeCache(cache: UpdateCheckCache, cachePath: string = CACHE_PATH): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache));
}

export function shouldCheck(cache: UpdateCheckCache | null): boolean {
  if (cache === null) return true;
  return Date.now() - cache.lastCheck > CHECK_INTERVAL_MS;
}

export function isNewerVersion(current: string, latest: string): boolean {
  const parseSemver = (v: string): [number, number, number] => {
    const parts = v.replace(/^v/, "").split(".").map(Number);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const [cMajor, cMinor, cPatch] = parseSemver(current);
  const [lMajor, lMinor, lPatch] = parseSemver(latest);

  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { "User-Agent": "micode-beads-update-check" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { tag_name?: string };
    const tag = data?.tag_name;
    if (typeof tag !== "string") return null;
    return tag.replace(/^v/, "");
  } catch {
    return null;
  }
}

export function displayUpdateNotice(current: string, latest: string): void {
  const isTTY = process.stderr.isTTY === true;
  const noColor = "NO_COLOR" in process.env;
  const useColor = isTTY && !noColor;

  const yellow = useColor ? "\x1b[33m" : "";
  const bold = useColor ? "\x1b[1m" : "";
  const reset = useColor ? "\x1b[0m" : "";

  const line1 = `${yellow}Update available: ${current} -> ${bold}${latest}${reset}`;
  const line2 = `Run ${bold}bun add -g micode-beads@latest${reset} or ${bold}npm update -g micode-beads${reset} to upgrade.`;
  process.stderr.write(`\n${line1}\n${line2}\n`);
}

export async function checkForUpdates(currentVersion: string): Promise<void> {
  if (process.env.MICODE_NO_UPDATE_CHECK) return;

  const cache = readCache();

  if (cache && isNewerVersion(currentVersion, cache.latestVersion)) {
    process.on("exit", () => {
      displayUpdateNotice(currentVersion, cache.latestVersion);
    });
  }

  if (shouldCheck(cache)) {
    spawnBackgroundFetch(currentVersion);
  }
}

function spawnBackgroundFetch(currentVersion: string): void {
  const cachePath = CACHE_PATH;
  const cacheDir = dirname(cachePath);

  const script = [
    `const r = ${JSON.stringify(GITHUB_REPO)};`,
    `const p = ${JSON.stringify(cachePath)};`,
    `const d = ${JSON.stringify(cacheDir)};`,
    `const c = ${JSON.stringify(currentVersion)};`,
    "fetch(`https://api.github.com/repos/${r}/releases/latest`,",
    '  {headers:{"User-Agent":"micode-beads-update-check"},signal:AbortSignal.timeout(10000)})',
    "  .then(r=>r.ok?r.json():null)",
    "  .then(data=>{",
    "    if(!data||!data.tag_name)process.exit(0);",
    '    const v=data.tag_name.replace(/^v/,"");',
    "    const fs=require('fs');",
    "    fs.mkdirSync(d,{recursive:true});",
    "    fs.writeFileSync(p,JSON.stringify({lastCheck:Date.now(),latestVersion:v,currentVersion:c}));",
    "  })",
    "  .catch(()=>{});",
  ].join("");

  try {
    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Silently ignore spawn failures
  }
}
