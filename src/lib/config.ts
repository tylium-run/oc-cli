// Config management for oc-cli.
//
// Config is profile-based. Every operation requires a profile that specifies
// at minimum a baseUrl. The config file lives at ~/.oc-cli.json.
//
// Config file structure:
//   {
//     "titlePrefix": "[bishop]",          ← global, shared across all profiles
//     "profiles": {
//       "my-project": {
//         "baseUrl": "https://...",        ← required
//         "directory": "/path/to/project", ← optional, sets x-opencode-directory header
//         "defaultAgent": "coder",         ← optional, default --agent for prompt
//         "description": "My project",     ← optional, for display
//         "tags": ["tag1", "tag2"]         ← optional, for filtering
//       }
//     }
//   }
//
// Resolution priority (highest to lowest):
//   1. CLI flags (--base-url, --title-prefix)
//   2. Environment variables (OC_BASE_URL, OC_TITLE_PREFIX)
//   3. Profile values (from the selected profile)
//   4. Hardcoded defaults
//
// Profile selection:
//   - Explicit: -p <name> / --profile <name>
//   - Implicit: if exactly 1 profile exists, auto-select it
//   - Error: if 0 profiles or 2+ profiles without -p

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---- Types ----

/** A single profile stored in the config file. */
export interface Profile {
  baseUrl: string;
  directory?: string;
  defaultAgent?: string;
  description?: string;
  tags?: string[];
}

/** Valid keys that can be set on a profile via `profile set`. */
export const PROFILE_KEYS: (keyof Profile)[] = [
  "baseUrl",
  "directory",
  "defaultAgent",
  "description",
  "tags",
];

/** The shape of the config file on disk. */
export interface ConfigFile {
  titlePrefix?: string;
  profiles?: Record<string, Profile>;
}

/** Global config keys (top-level, not per-profile). */
export const GLOBAL_CONFIG_KEYS = ["titlePrefix"] as const;
export type GlobalConfigKey = (typeof GLOBAL_CONFIG_KEYS)[number];

/** The fully resolved config used at runtime. */
export interface Config {
  baseUrl: string;
  directory?: string;
  defaultAgent?: string;
  titlePrefix: string;
  activeProfile: string;
}

// ---- Config file path ----

/** Returns the path to the config file: ~/.oc-cli.json */
export function getConfigPath(): string {
  return join(homedir(), ".oc-cli.json");
}

// ---- Config file read/write ----

/**
 * Load the config file from disk.
 * Returns an empty object if the file doesn't exist yet.
 */
export function loadConfigFile(): ConfigFile {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as ConfigFile;
  } catch {
    // If the file is corrupt/unreadable, treat it as empty.
    return {};
  }
}

/**
 * Save config to the config file on disk.
 * Overwrites the entire file with the given object.
 */
export function saveConfigFile(config: ConfigFile): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ---- Profile helpers ----

/**
 * Get all profiles from the config file.
 * Returns an empty object if no profiles are defined.
 */
export function getProfiles(): Record<string, Profile> {
  const file = loadConfigFile();
  return file.profiles ?? {};
}

/**
 * Get a single profile by name. Returns undefined if not found.
 */
export function getProfile(name: string): Profile | undefined {
  return getProfiles()[name];
}

/**
 * Save a profile to the config file (add or update).
 */
export function saveProfile(name: string, profile: Profile): void {
  const file = loadConfigFile();
  if (!file.profiles) file.profiles = {};
  file.profiles[name] = profile;
  saveConfigFile(file);
}

/**
 * Remove a profile from the config file. Returns true if it existed.
 */
export function removeProfile(name: string): boolean {
  const file = loadConfigFile();
  if (!file.profiles || !(name in file.profiles)) return false;
  delete file.profiles[name];
  saveConfigFile(file);
  return true;
}

// ---- Config resolution ----

/** CLI flags that can override config values. */
export interface CliOverrides {
  baseUrl?: string;
  titlePrefix?: string;
  profile?: string;
}

/**
 * Resolve the final config by selecting a profile and merging overrides.
 *
 * Profile selection:
 *   1. Explicit profileName (from -p flag)
 *   2. Implicit: if exactly 1 profile exists, use it
 *   3. Error: if 0 profiles or 2+ profiles without -p
 *
 * Value resolution priority (highest to lowest):
 *   1. CLI flags (--base-url, --title-prefix)
 *   2. Environment variables (OC_BASE_URL, OC_TITLE_PREFIX)
 *   3. Profile values
 *   4. Hardcoded defaults
 *
 * Title prefix is computed as: globalTitlePrefix + "[profileName] "
 */
export function resolveConfig(overrides: CliOverrides = {}): Config {
  const file = loadConfigFile();
  const profiles = file.profiles ?? {};
  const profileNames = Object.keys(profiles);

  // ---- Determine active profile ----
  let activeProfileName: string;
  let activeProfile: Profile;

  if (overrides.profile) {
    // Explicit -p flag
    activeProfileName = overrides.profile;
    const found = profiles[activeProfileName];
    if (!found) {
      const available = profileNames.length > 0
        ? ` Available: ${profileNames.join(", ")}`
        : " No profiles configured.";
      throw new Error(
        `Profile "${activeProfileName}" not found.${available} ` +
        `Run \`oc-cli profile add <name>\` to create one.`,
      );
    }
    activeProfile = found;
  } else if (profileNames.length === 1) {
    // Implicit: exactly one profile
    activeProfileName = profileNames[0];
    activeProfile = profiles[activeProfileName];
  } else if (profileNames.length === 0) {
    throw new Error(
      "No profiles configured. Run `oc-cli profile add <name>` to create one.",
    );
  } else {
    throw new Error(
      `Multiple profiles configured: ${profileNames.join(", ")}. ` +
      `Use -p <name> to select one.`,
    );
  }

  // ---- Resolve baseUrl ----
  // Priority: CLI flag > env var > profile value
  const baseUrl =
    overrides.baseUrl ??
    process.env.OC_BASE_URL ??
    activeProfile.baseUrl;

  // ---- Resolve titlePrefix ----
  // Priority: CLI flag > env var > config file global
  const globalPrefix =
    overrides.titlePrefix ??
    process.env.OC_TITLE_PREFIX ??
    file.titlePrefix ??
    "";

  // Auto-append [profileName] to the global prefix.
  // "[bishop]" + "safegold-react" → "[bishop][safegold-react] "
  // "" + "safegold-react" → "[safegold-react] "
  const titlePrefix = globalPrefix
    ? `${globalPrefix}[${activeProfileName}] `
    : `[${activeProfileName}] `;

  return {
    baseUrl,
    directory: activeProfile.directory,
    defaultAgent: activeProfile.defaultAgent,
    titlePrefix,
    activeProfile: activeProfileName,
  };
}

/**
 * Get the source of a global config value (for `config get`).
 */
export function getGlobalConfigSource(
  key: GlobalConfigKey,
  cliOverrides: CliOverrides = {},
): string {
  if (key === "titlePrefix") {
    if (cliOverrides.titlePrefix !== undefined) return "cli flag";
    if (process.env.OC_TITLE_PREFIX !== undefined) return "env (OC_TITLE_PREFIX)";
    const file = loadConfigFile();
    if (file.titlePrefix !== undefined) return "config file";
    return "default";
  }
  return "default";
}
