// Output helper for consistent CLI output formatting.
//
// Three modes:
//   1. Default: compact JSON (one line, no extra whitespace) — for LLMs/scripts
//   2. --pretty: human-readable table with colors
//   3. --fields: filter to specific fields — for LLMs to save tokens
//
// Errors always go to stderr as JSON: {"error": "message"}
//
// chalk basics:
//   chalk.bold("text")       → bold text
//   chalk.dim("text")        → dimmed/faded text
//   chalk.red("text")        → red text
//   chalk.green("text")      → green text
//   chalk.cyan("text")       → cyan text
//   chalk.bold.cyan("text")  → you can chain them

import chalk from "chalk";

// ---- Types ----

// The options that output-related flags produce.
// Commands will pass these through from Commander.
export interface OutputOptions {
  pretty?: boolean;
  fields?: string;
  filter?: string[];
}

// ---- Data output ----

/**
 * Print an array of objects in the correct format based on flags.
 *
 * @param data    - Array of objects to output
 * @param options - The parsed CLI flags (pretty, fields)
 * @param columns - For --pretty mode: which fields to show and how wide.
 *                  Example: [{ key: "id", label: "ID", width: 35 }, ...]
 */
export function printData(
  data: Record<string, unknown>[],
  options: OutputOptions,
  columns: { key: string; label: string; width: number }[],
): void {
  // Step 1: If --filter is set, narrow down to matching rows.
  // --filter can be repeated: --filter slug=brave --filter title=Linear
  // All filters must match (AND logic).
  const matched = options.filter ? filterData(data, options.filter) : data;

  // Step 2: If --fields is set, filter each object to only those keys.
  const filtered = options.fields ? filterFields(matched, options.fields) : matched;

  // Step 3: Pick the output format.
  if (options.pretty) {
    printTable(filtered, columns);
  } else {
    // Default: compact JSON on a single line. No colors here —
    // JSON output should be clean for machine parsing.
    console.log(JSON.stringify(filtered));
  }
}

// ---- Error output ----

/**
 * Print an error as JSON to stderr and exit with code 1.
 * In --pretty mode we could show a colored message, but for consistency
 * errors are always JSON so LLMs can parse success vs failure.
 */
export function printError(message: string): never {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

// ---- Internal helpers ----

/**
 * Filter rows where all key=value conditions match (case-insensitive contains).
 *
 * Examples:
 *   --filter slug=brave          → rows where slug contains "brave"
 *   --filter slug=brave --filter title=Linear  → both must match (AND)
 *
 * Supports dot notation for nested fields:
 *   --filter summary.files=0     → rows where summary.files contains "0"
 */
function filterData(data: Record<string, unknown>[], filters: string[]): Record<string, unknown>[] {
  // Parse each "key=value" string into a { key, value } pair.
  const conditions = filters.map((f) => {
    const eqIndex = f.indexOf("=");
    if (eqIndex === -1) {
      printError(`Invalid filter format: "${f}". Expected key=value`);
    }
    return {
      key: f.slice(0, eqIndex).trim(),
      value: f
        .slice(eqIndex + 1)
        .trim()
        .toLowerCase(),
    };
  });

  return data.filter((item) =>
    conditions.every(({ key, value }) => {
      // Resolve dot notation: "summary.files" → item.summary.files
      const resolved = resolveDotPath(item, key);
      if (resolved === undefined) return false;
      return String(resolved).toLowerCase().includes(value);
    }),
  );
}

/**
 * Resolve a dot-separated path on an object.
 * resolveDotPath({a: {b: 1}}, "a.b") → 1
 * resolveDotPath({a: 1}, "a.b") → undefined
 */
function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Filter each object to only include the specified comma-separated fields.
 * Example: filterFields([{id: 1, name: "a", extra: true}], "id,name")
 *        → [{id: 1, name: "a"}]
 */
function filterFields(data: Record<string, unknown>[], fields: string): Record<string, unknown>[] {
  const keys = fields.split(",").map((f) => f.trim());
  return data.map((item) => {
    const filtered: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in item) {
        filtered[key] = item[key];
      }
    }
    return filtered;
  });
}

/**
 * Print data as a human-readable table with colors.
 * Truncates values that exceed the column width.
 */
function printTable(
  data: Record<string, unknown>[],
  columns: { key: string; label: string; width: number }[],
): void {
  // If --fields filtered out some columns, only show columns that exist in the data.
  const dataKeys = data.length > 0 ? new Set(Object.keys(data[0] as object)) : new Set<string>();
  const visibleColumns = data.length > 0 ? columns.filter((c) => dataKeys.has(c.key)) : columns;

  // Print header row — bold and cyan.
  const header = visibleColumns.map((c) => chalk.bold.cyan(c.label.padEnd(c.width))).join("  ");
  console.log(header);
  console.log(chalk.dim("-".repeat(visibleColumns.reduce((sum, c) => sum + c.width + 2, -2))));

  // Print each data row with per-column styling.
  for (const item of data) {
    const cells = visibleColumns.map((c) => {
      const raw = String(item[c.key] ?? "");
      const truncated =
        raw.length > c.width ? raw.slice(0, c.width - 3) + "..." : raw.padEnd(c.width);

      // Apply different colors based on the column key.
      if (c.key === "id") return chalk.dim(truncated);
      if (c.key === "title" || c.key === "name") return chalk.white(truncated);
      if (c.key === "slug") return chalk.green(truncated);
      if (c.key === "provider") return chalk.cyan(truncated);
      if (c.key === "default" && raw === "yes") return chalk.green.bold(truncated);
      return truncated;
    });
    console.log(cells.join("  "));
  }

  // Print a summary footer.
  console.log();
  console.log(chalk.dim(`${data.length} result${data.length === 1 ? "" : "s"}`));
}
