import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import * as v from "valibot";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { config } from "../utils/config";
import { log } from "../utils/logger";
import type { Preference, PreferenceStore } from "./types";
import { PreferenceStoreSchema } from "./types";

const MODULE = "preferences.store";

interface CacheEntry {
  data: Preference[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function isCacheValid(entry: CacheEntry | undefined): entry is CacheEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < config.preferences.cacheTtlMs;
}

function invalidateCache(key: string): void {
  cache.delete(key);
}

function getGlobalFilePath(): string {
  return join(homedir(), ".config", "opencode", config.preferences.globalFile);
}

function getProjectFilePath(projectDir: string): string {
  return join(projectDir, config.preferences.projectDir, config.preferences.projectFile);
}

function generateId(): string {
  return `pref-${crypto.randomUUID().slice(0, 8)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

async function loadPreferencesFromFile(filePath: string): Promise<Preference[]> {
  const cached = cache.get(filePath);
  if (isCacheValid(cached)) {
    return cached.data;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = parseYaml(content);
    const store = v.parse(PreferenceStoreSchema, parsed);
    cache.set(filePath, { data: store.preferences, timestamp: Date.now() });
    return store.preferences;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      cache.set(filePath, { data: [], timestamp: Date.now() });
      return [];
    }
    log.warn(MODULE, `Failed to load preferences from ${filePath}: ${error}`);
    return [];
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function savePreferencesToFile(filePath: string, preferences: Preference[]): Promise<void> {
  const store: PreferenceStore = { version: 1, preferences };
  const yaml = stringifyYaml(store, { lineWidth: 120 });
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, yaml, "utf-8");
  invalidateCache(filePath);
}

/** Load preferences from the global preferences file (~/.config/opencode/preferences.yaml) */
export async function loadGlobalPreferences(): Promise<Preference[]> {
  return loadPreferencesFromFile(getGlobalFilePath());
}

/** Load preferences from the project preferences file ({projectDir}/.micode/preferences.yaml) */
export async function loadProjectPreferences(projectDir: string): Promise<Preference[]> {
  return loadPreferencesFromFile(getProjectFilePath(projectDir));
}

/** Load all preferences from both global and project files, combined into a single array */
export async function loadAllPreferences(projectDir: string): Promise<Preference[]> {
  const [global, project] = await Promise.all([loadGlobalPreferences(), loadProjectPreferences(projectDir)]);
  return [...global, ...project];
}

/** Persist preferences to the global preferences file */
export async function saveGlobalPreferences(preferences: Preference[]): Promise<void> {
  return savePreferencesToFile(getGlobalFilePath(), preferences);
}

/** Persist preferences to the project preferences file */
export async function saveProjectPreferences(projectDir: string, preferences: Preference[]): Promise<void> {
  return savePreferencesToFile(getProjectFilePath(projectDir), preferences);
}

/** Add a new preference, generating an ID and timestamps automatically */
export async function addPreference(
  projectDir: string,
  preference: Omit<Preference, "id" | "createdAt" | "updatedAt">,
  target: "global" | "project",
): Promise<Preference> {
  const now = nowISO();
  const newPreference: Preference = {
    ...preference,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (target === "global") {
    const existing = await loadGlobalPreferences();
    await saveGlobalPreferences([...existing, newPreference]);
  } else {
    const existing = await loadProjectPreferences(projectDir);
    await saveProjectPreferences(projectDir, [...existing, newPreference]);
  }

  return newPreference;
}

/** Update an existing preference by ID, searching both global and project files */
export async function updatePreference(
  projectDir: string,
  id: string,
  updates: Partial<Pick<Preference, "description" | "category" | "scope" | "enabled" | "examples">>,
): Promise<Preference | null> {
  const now = nowISO();

  const globalPrefs = await loadGlobalPreferences();
  const globalIndex = globalPrefs.findIndex((p) => p.id === id);
  if (globalIndex !== -1) {
    const updated = { ...globalPrefs[globalIndex], ...updates, updatedAt: now };
    globalPrefs[globalIndex] = updated;
    await saveGlobalPreferences(globalPrefs);
    return updated;
  }

  const projectPrefs = await loadProjectPreferences(projectDir);
  const projectIndex = projectPrefs.findIndex((p) => p.id === id);
  if (projectIndex !== -1) {
    const updated = { ...projectPrefs[projectIndex], ...updates, updatedAt: now };
    projectPrefs[projectIndex] = updated;
    await saveProjectPreferences(projectDir, projectPrefs);
    return updated;
  }

  return null;
}

/** Delete a preference by ID, searching both global and project files */
export async function deletePreference(projectDir: string, id: string): Promise<boolean> {
  const globalPrefs = await loadGlobalPreferences();
  const globalIndex = globalPrefs.findIndex((p) => p.id === id);
  if (globalIndex !== -1) {
    globalPrefs.splice(globalIndex, 1);
    await saveGlobalPreferences(globalPrefs);
    return true;
  }

  const projectPrefs = await loadProjectPreferences(projectDir);
  const projectIndex = projectPrefs.findIndex((p) => p.id === id);
  if (projectIndex !== -1) {
    projectPrefs.splice(projectIndex, 1);
    await saveProjectPreferences(projectDir, projectPrefs);
    return true;
  }

  return false;
}

/** Clear the in-memory cache (useful for testing) */
export function clearCache(): void {
  cache.clear();
}
