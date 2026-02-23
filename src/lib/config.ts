// Config management for oc-cli.
//
// Config is resolved by merging multiple layers, highest priority first:
//   1. CLI flags (--base-url, --title-prefix)
//   2. Environment variables (OC_BASE_URL, OC_TITLE_PREFIX)
//   3. Config file (~/.oc-cli.json)
//   4. Hardcoded defaults
//
// HOW IT WORKS:
// - `resolveConfig(cliFlags)` is the main entry point. It reads all layers
//   and merges them. The result is a simple object with final values.
// - `loadConfigFile()` / `saveConfigFile()` handle the JSON file on disk.
// - The config file is only created when the user runs `config set`.
//
// NODE CONCEPTS USED:
// - `os.homedir()` — returns the user's home directory (e.g. /Users/aakash)
// - `fs.readFileSync` / `fs.writeFileSync` — read/write files synchronously
//   (sync is fine here because config is loaded once at startup, not in a loop)
// - `process.env` — object containing all environment variables

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---- Types ----

/** The shape of our config. Every key here is a valid config setting. */
export interface Config {
  baseUrl: string;
  titlePrefix: string;
}

/** The valid config keys — used to validate `config set <key>`. */
export const CONFIG_KEYS: (keyof Config)[] = ["baseUrl", "titlePrefix"];

// ---- Defaults ----

const DEFAULTS: Config = {
  baseUrl: "https://devs-mac-mini.taild2246a.ts.net:4096",
  titlePrefix: "",
};

// ---- Config file path ----

/** Returns the path to the config file: ~/.oc-cli.json */
export function getConfigPath(): string {
  return join(homedir(), ".oc-cli.json");
}

// ---- Config file read/write ----

/**
 * Load the config file from disk.
 * Returns an empty object if the file doesn't exist yet.
 * Returns a partial Config — only the keys the user has set.
 */
export function loadConfigFile(): Partial<Config> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Partial<Config>;
  } catch {
    // If the file is corrupt/unreadable, treat it as empty.
    return {};
  }
}

/**
 * Save config to the config file on disk.
 * Overwrites the entire file with the given object.
 * The file is written with 2-space indentation for readability.
 */
export function saveConfigFile(config: Partial<Config>): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ---- Config resolution ----

/**
 * Maps environment variable names to config keys.
 * When the user sets OC_BASE_URL=..., it maps to config.baseUrl.
 */
const ENV_MAP: Record<string, keyof Config> = {
  OC_BASE_URL: "baseUrl",
  OC_TITLE_PREFIX: "titlePrefix",
};

/**
 * Resolve the final config by merging all layers.
 *
 * Priority (highest to lowest):
 *   1. cliFlags  — from Commander's global options (--base-url, --title-prefix)
 *   2. env vars  — OC_BASE_URL, OC_TITLE_PREFIX
 *   3. config file — ~/.oc-cli.json
 *   4. defaults  — hardcoded above
 *
 * @param cliFlags - Partial config from CLI flags. Only includes keys
 *                   the user actually passed on the command line.
 */
export function resolveConfig(cliFlags: Partial<Config> = {}): Config {
  // Layer 3: config file
  const fileConfig = loadConfigFile();

  // Layer 2: environment variables
  const envConfig: Partial<Config> = {};
  for (const [envVar, configKey] of Object.entries(ENV_MAP)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      envConfig[configKey] = value;
    }
  }

  // Merge: defaults ← file ← env ← cli flags
  // The spread operator overwrites left-to-right, so later layers win.
  return {
    ...DEFAULTS,
    ...fileConfig,
    ...envConfig,
    ...cliFlags,
  };
}

/**
 * Get the source of a config value (for `config get --pretty`).
 * Checks each layer from highest to lowest priority and returns
 * the name of the first layer that has a value for the given key.
 */
export function getConfigSource(
  key: keyof Config,
  cliFlags: Partial<Config> = {},
): string {
  // Check CLI flags first (highest priority)
  if (cliFlags[key] !== undefined) return "cli flag";

  // Check environment variables
  const envEntry = Object.entries(ENV_MAP).find(([, k]) => k === key);
  if (envEntry && process.env[envEntry[0]] !== undefined) return `env (${envEntry[0]})`;

  // Check config file
  const fileConfig = loadConfigFile();
  if (fileConfig[key] !== undefined) return "config file";

  // Must be the default
  return "default";
}
