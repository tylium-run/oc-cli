// Config commands: set, get, list, path
//
// Manages global config values (not per-profile settings — use `profile set`
// for those). Currently the only global key is `titlePrefix`.

import { Command } from "commander";
import chalk from "chalk";
import {
  GLOBAL_CONFIG_KEYS,
  getConfigPath,
  loadConfigFile,
  saveConfigFile,
  resolveConfig,
  getGlobalConfigSource,
  type GlobalConfigKey,
  type CliOverrides,
} from "../lib/config.js";
import { printData, printError } from "../lib/output.js";

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("Manage oc-cli global configuration");

  // ---- config set <key> <value> ----
  // Writes a global config key to the config file.
  // Currently only supports titlePrefix.
  config
    .command("set <key> <value>")
    .description("Set a global config value (saves to ~/.oc-cli.json)")
    .action((key: string, value: string) => {
      if (!GLOBAL_CONFIG_KEYS.includes(key as GlobalConfigKey)) {
        printError(
          `Unknown global config key: "${key}". Valid keys: ${GLOBAL_CONFIG_KEYS.join(", ")}. ` +
          `For profile settings, use: oc-cli profile set <name> <key> <value>`,
        );
        return;
      }

      const file = loadConfigFile();
      (file as Record<string, unknown>)[key] = value;
      saveConfigFile(file);

      console.log(JSON.stringify({ [key]: value }));
    });

  // ---- config get <key> ----
  // Shows the resolved value for a global config key.
  config
    .command("get <key>")
    .description("Get the resolved value for a global config key")
    .option("--pretty", "Show the value source alongside the value")
    .action((key: string, options: { pretty?: boolean }) => {
      if (!GLOBAL_CONFIG_KEYS.includes(key as GlobalConfigKey)) {
        printError(
          `Unknown global config key: "${key}". Valid keys: ${GLOBAL_CONFIG_KEYS.join(", ")}. ` +
          `For profile settings, use: oc-cli profile show <name>`,
        );
        return;
      }

      const globalOpts = program.opts();
      const overrides: CliOverrides = {};
      if (globalOpts.titlePrefix) overrides.titlePrefix = globalOpts.titlePrefix;

      const file = loadConfigFile();
      // For global keys, resolve directly without needing a profile.
      const value = overrides.titlePrefix ?? process.env.OC_TITLE_PREFIX ?? file.titlePrefix ?? "";
      const source = getGlobalConfigSource(key as GlobalConfigKey, overrides);

      if (options.pretty) {
        console.log(`${chalk.bold(key)}: ${chalk.white(value)} ${chalk.dim(`(${source})`)}`);
      } else {
        console.log(JSON.stringify({ [key]: value, source }));
      }
    });

  // ---- config list ----
  // Shows all global config values.
  config
    .command("list")
    .description("Show all global config values")
    .option("--pretty", "Output as a human-readable table")
    .option("--fields <fields>", "Comma-separated list of fields to include")
    .action((options: { pretty?: boolean; fields?: string }) => {
      const globalOpts = program.opts();
      const overrides: CliOverrides = {};
      if (globalOpts.titlePrefix) overrides.titlePrefix = globalOpts.titlePrefix;

      const file = loadConfigFile();

      const rows: Record<string, unknown>[] = GLOBAL_CONFIG_KEYS.map((key) => {
        const value =
          key === "titlePrefix"
            ? (overrides.titlePrefix ?? process.env.OC_TITLE_PREFIX ?? file.titlePrefix ?? "")
            : "";
        return {
          key,
          value,
          source: getGlobalConfigSource(key, overrides),
        };
      });

      const columns = [
        { key: "key", label: "KEY", width: 15 },
        { key: "value", label: "VALUE", width: 55 },
        { key: "source", label: "SOURCE", width: 20 },
      ];

      printData(rows, options, columns);
    });

  // ---- config path ----
  config
    .command("path")
    .description("Print the config file path")
    .action(() => {
      console.log(JSON.stringify({ path: getConfigPath() }));
    });
}
