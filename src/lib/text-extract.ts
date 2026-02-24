// Text extraction utilities for session messages.
//
// Provides pure functions to validate text-related CLI options and
// extract text content from message arrays. Extracted from the
// session messages command to enable unit testing.

export interface MessageData {
  info: Record<string, unknown>;
  parts: Record<string, unknown>[];
}

export interface TextOptions {
  text?: boolean;
  all?: boolean;
  pretty?: boolean;
}

/**
 * Validate text-related CLI options for mutual exclusivity.
 *
 * @param options - The CLI options to validate.
 * @returns An error message string if invalid, `null` if valid.
 */
export function validateTextOptions(options: TextOptions): string | null {
  if (options.all && !options.text) {
    return "--all requires --text. Usage: oc-cli session messages <id> --text --all";
  }
  if (options.text && options.pretty) {
    return "--text and --pretty are mutually exclusive.";
  }
  return null;
}

/**
 * Extract text content from session messages.
 *
 * @param messages - Array of message objects with info and parts.
 * @param options  - Controls whether to return all messages or just the last assistant.
 * @returns Array of text strings. Empty if no text content found.
 */
export function extractTextOutput(messages: MessageData[], options: TextOptions): string[] {
  const lines: string[] = [];

  if (options.all) {
    for (const msg of messages) {
      const role = msg.info.role as string;
      const textParts = msg.parts.filter((p) => p.type === "text");
      if (textParts.length === 0) continue;
      const text = textParts.map((p) => p.text as string).join("\n");
      lines.push(`[${role}] ${text}`);
    }
  } else {
    // Default: extract last assistant message with text content
    const assistantMessages = messages.filter((m) => m.info.role === "assistant");
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const msg = assistantMessages[i];
      const textParts = msg.parts.filter((p) => p.type === "text");
      if (textParts.length === 0) continue;
      const text = textParts.map((p) => p.text as string).join("\n");
      lines.push(text);
      break;
    }
  }

  return lines;
}
