// Pretty event formatter for the watch command.
//
// How messages actually flow in the SSE stream:
//
//   message.updated (role=user)           ← metadata only, no text
//   message.part.updated (type=text)      ← user's prompt (full text in part.text)
//   message.updated (role=assistant)      ← metadata (model, provider)
//   message.part.updated (type=text)      ← empty text="" (placeholder)
//   message.part.delta (field=text)       ← streaming chunks: "Hello", " there", ...
//   message.part.updated (type=text)      ← final full text in part.text
//   message.part.updated (type=step-finish) ← cost/token summary
//
// Key insights:
//   - User text is in message.part.updated → part.text (no delta)
//   - Assistant streaming is via message.part.delta (separate event type!)
//   - message.part.updated for assistant text arrives twice: once empty
//     (placeholder) and once with the final text. We skip both since
//     we already streamed via deltas.

import chalk from "chalk";

// ---- State ----

export interface FormatterState {
  /** Map messageID → role */
  messageRoles: Map<string, string>;
  /** Map messageID → model string */
  messageModels: Map<string, string>;
  /** Map messageID → sessionID */
  messageSessions: Map<string, string>;
  /** Parts we've already streamed deltas for (don't re-print on final update) */
  streamedParts: Set<string>;
  /** Tool calls we've already shown */
  toolsShown: Set<string>;
  /** Last part type we output */
  lastPartType: string;
  /** Whether we've output anything */
  hasOutput: boolean;
  /** Sessions where we've already printed the assistant header */
  assistantHeaderShown: Set<string>;
  /** Sessions where we've already printed the user header */
  userHeaderShown: Set<string>;
  /** Output stream for direct writes (deltas, newlines). Defaults to process.stdout. */
  writer: NodeJS.WriteStream;
}

/**
 * Create a new formatter state.
 *
 * @param writer - Output stream for direct writes (deltas, end-of-stream newlines).
 *                 Defaults to `process.stdout` which is correct for the `watch` command.
 *                 Pass `process.stderr` when used from the `run` command so stdout
 *                 stays clean for the final JSON result.
 */
export function createFormatterState(writer?: NodeJS.WriteStream): FormatterState {
  return {
    messageRoles: new Map(),
    messageModels: new Map(),
    messageSessions: new Map(),
    streamedParts: new Set(),
    toolsShown: new Set(),
    lastPartType: "",
    hasOutput: false,
    assistantHeaderShown: new Set(),
    userHeaderShown: new Set(),
    writer: writer ?? process.stdout,
  };
}

// ---- Helpers ----

function separator(): string {
  return chalk.dim("─".repeat(50));
}

function truncate(text: string, maxLen: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length > maxLen) return cleaned.slice(0, maxLen) + "…";
  return cleaned;
}

/** Ensure newline after streaming text before printing a block. */
function endStreaming(state: FormatterState): void {
  if (state.lastPartType === "text-stream" || state.lastPartType === "reasoning") {
    state.writer.write("\n");
  }
}

/**
 * Print a header for user/assistant if not already shown for this session.
 * Deduplicates per session so multi-step assistant responses don't
 * repeat the "Assistant" header on each step.
 */
function ensureHeader(
  messageId: string,
  role: string,
  model: string,
  state: FormatterState,
  lines: string[],
): void {
  const sessionId = state.messageSessions.get(messageId) ?? "";

  if (role === "assistant") {
    if (state.assistantHeaderShown.has(sessionId)) return;
    state.assistantHeaderShown.add(sessionId);
    // Clear user header for next round of conversation.
    state.userHeaderShown.delete(sessionId);

    endStreaming(state);
    if (state.hasOutput) lines.push("");

    const modelLabel = model ? chalk.dim(` (${model})`) : "";
    lines.push(`${chalk.magenta.bold("Assistant")}${modelLabel}`);
  } else if (role === "user") {
    if (state.userHeaderShown.has(sessionId)) return;
    state.userHeaderShown.add(sessionId);
    // Clear assistant header so next assistant response gets a header.
    state.assistantHeaderShown.delete(sessionId);

    endStreaming(state);
    if (state.hasOutput) lines.push("");
    lines.push(chalk.blue.bold("User"));
  }
}

// ---- Main formatter ----

export function formatEvent(event: Record<string, unknown>, state: FormatterState): string[] {
  const type = event.type as string;
  const props = (event.properties ?? {}) as Record<string, unknown>;
  const lines: string[] = [];

  switch (type) {
    // ================================================================
    // SERVER
    // ================================================================
    case "server.connected":
      lines.push(chalk.green("Connected"));
      break;

    // ================================================================
    // SESSION LIFECYCLE
    // ================================================================
    case "session.created": {
      const info = props.info as Record<string, unknown>;
      endStreaming(state);
      if (state.hasOutput) lines.push(separator());
      lines.push(
        `${chalk.green("+")} Session ${chalk.bold((info?.title as string) || (info?.slug as string) || "")} ${chalk.dim(info?.id as string)}`,
      );
      break;
    }

    case "session.deleted": {
      const info = props.info as Record<string, unknown>;
      endStreaming(state);
      if (state.hasOutput) lines.push(separator());
      lines.push(`${chalk.red("-")} Session deleted ${chalk.dim(info?.id as string)}`);
      break;
    }

    case "session.updated":
      return [];

    // ================================================================
    // SESSION STATUS — only show retries and errors
    // ================================================================
    case "session.status": {
      const status = props.status as Record<string, unknown>;
      if ((status?.type as string) === "retry") {
        endStreaming(state);
        lines.push(
          chalk.yellow(`Retrying (#${status?.attempt})`) +
            (status?.message ? chalk.dim(` — ${status.message}`) : ""),
        );
        break;
      }
      return [];
    }

    case "session.idle":
    case "session.compacted":
      return [];

    // ================================================================
    // SESSION ERROR
    // ================================================================
    case "session.error": {
      const err = props.error as Record<string, unknown>;
      const errData = err?.data as Record<string, unknown> | undefined;
      const message = (errData?.message ?? err?.message ?? "Unknown error") as string;
      endStreaming(state);
      lines.push(`${chalk.red("Error:")} ${message}`);
      break;
    }

    // ================================================================
    // MESSAGES — silently track role, don't display
    // ================================================================
    case "message.updated": {
      const info = props.info as Record<string, unknown>;
      const msgId = info?.id as string;
      const role = info?.role as string;
      const sessId = info?.sessionID as string;
      if (msgId && role) {
        state.messageRoles.set(msgId, role);
        if (sessId) state.messageSessions.set(msgId, sessId);
        if (role === "assistant") {
          const provider = info?.providerID as string;
          const model = info?.modelID as string;
          if (provider && model) {
            state.messageModels.set(msgId, `${provider}/${model}`);
          }
        }
      }
      return [];
    }

    case "message.removed":
      return [];

    // ================================================================
    // MESSAGE PART DELTA — streaming text chunks from the assistant
    // This is the event that carries the actual streaming content!
    // ================================================================
    case "message.part.delta": {
      const messageId = props.messageID as string;
      const partId = props.partID as string;
      const sessionId = props.sessionID as string;
      const delta = props.delta as string;
      const field = props.field as string;

      if (!delta) return [];

      // Mark this part as streamed so we don't re-print on the final update.
      if (partId) state.streamedParts.add(partId);
      // Track session mapping in case message.updated hasn't arrived yet.
      if (messageId && sessionId) state.messageSessions.set(messageId, sessionId);

      const role = state.messageRoles.get(messageId) ?? "assistant";
      const model = state.messageModels.get(messageId) ?? "";

      if (field === "text") {
        ensureHeader(messageId, role, model, state, lines);
        // Flush header lines first.
        for (const l of lines.splice(0)) {
          state.writer.write(l + "\n");
        }
        state.writer.write(delta);
        state.lastPartType = "text-stream";
        state.hasOutput = true;
      }
      // Could handle field === "reasoning" here too if needed.

      return [];
    }

    // ================================================================
    // MESSAGE PARTS — full content snapshots
    // ================================================================
    case "message.part.updated": {
      const part = props.part as Record<string, unknown>;
      const partType = part?.type as string;
      const partId = part?.id as string;
      const messageId = part?.messageID as string;
      const sessionId = part?.sessionID as string;
      if (messageId && sessionId) state.messageSessions.set(messageId, sessionId);
      const role = state.messageRoles.get(messageId) ?? "unknown";
      const model = state.messageModels.get(messageId) ?? "";

      switch (partType) {
        case "text": {
          const text = (part?.text as string) ?? "";

          // If we already streamed this part via deltas, skip the final snapshot.
          if (state.streamedParts.has(partId)) return [];

          // Empty text = placeholder for assistant (arrives before deltas). Skip.
          if (!text) return [];

          // This is a non-streamed text part — likely the user's message.
          if (role === "user") {
            ensureHeader(messageId, role, model, state, lines);
            endStreaming(state);
            // Show user text with "> " prefix on each line.
            for (const line of text.split("\n")) {
              lines.push(`${chalk.blue(">")} ${chalk.white(line)}`);
            }
            state.lastPartType = "user-text";
            break;
          }

          // Assistant text that wasn't streamed (shouldn't happen normally,
          // but handle it as a fallback).
          ensureHeader(messageId, role, model, state, lines);
          endStreaming(state);
          lines.push(text);
          state.lastPartType = "text";
          break;
        }

        case "tool": {
          const toolState = part?.state as Record<string, unknown>;
          const toolName = part?.tool as string;
          const status = toolState?.status as string;
          const callId = part?.callID as string;
          const title = toolState?.title as string;
          const displayName = title || toolName;

          if (status === "pending") return [];

          if (status === "running") {
            if (state.toolsShown.has(callId)) return [];
            state.toolsShown.add(callId);
            ensureHeader(messageId, role, model, state, lines);
            endStreaming(state);
            lines.push(`  ${chalk.cyan(displayName)}`);
            state.lastPartType = "tool";
            break;
          }

          if (status === "completed") {
            if (!state.toolsShown.has(callId)) {
              ensureHeader(messageId, role, model, state, lines);
              endStreaming(state);
              lines.push(`  ${chalk.cyan(displayName)}`);
            }
            state.lastPartType = "tool";
            break;
          }

          if (status === "error") {
            const errMsg = toolState?.error as string;
            ensureHeader(messageId, role, model, state, lines);
            endStreaming(state);
            lines.push(
              `  ${chalk.red(displayName)} ${chalk.red("— " + truncate(errMsg || "failed", 60))}`,
            );
            state.lastPartType = "tool";
            break;
          }
          return [];
        }

        case "step-start":
          return [];

        case "step-finish":
          return [];

        case "subtask": {
          const desc = part?.description as string;
          ensureHeader(messageId, role, model, state, lines);
          endStreaming(state);
          lines.push(`  ${chalk.magenta("Subtask")} ${chalk.dim(truncate(desc || "", 60))}`);
          state.lastPartType = "subtask";
          break;
        }

        default:
          return [];
      }
      break;
    }

    case "message.part.removed":
      return [];

    // ================================================================
    // FILES
    // ================================================================
    case "file.edited":
      lines.push(`  ${chalk.yellow("Edited")} ${props.file as string}`);
      break;

    // ================================================================
    // DIFFS
    // ================================================================
    case "session.diff": {
      const diffs = (props.diff ?? []) as Record<string, unknown>[];
      if (diffs.length === 0) return [];
      for (const d of diffs.slice(0, 8)) {
        const path = (d.path ?? d.filename ?? "") as string;
        const additions = Number(d.additions ?? 0);
        const deletions = Number(d.deletions ?? 0);
        const stats = [
          additions > 0 ? chalk.green(`+${additions}`) : "",
          deletions > 0 ? chalk.red(`-${deletions}`) : "",
        ]
          .filter(Boolean)
          .join(" ");
        lines.push(`  ${chalk.dim(path)} ${stats}`);
      }
      if (diffs.length > 8) {
        lines.push(chalk.dim(`  … and ${diffs.length - 8} more files`));
      }
      break;
    }

    // ================================================================
    // PERMISSIONS
    // ================================================================
    case "permission.asked": {
      const permission = props.permission as string;
      const patterns = (props.patterns ?? []) as string[];
      const requestId = props.id as string;

      endStreaming(state);
      lines.push("");
      lines.push(`${chalk.yellow.bold("Permission required:")} ${chalk.white(permission)}`);
      for (const pattern of patterns) {
        lines.push(`  ${chalk.dim(pattern)}`);
      }
      lines.push(chalk.dim(`  oc-cli session permit ${requestId} [once|always|reject]`));
      lines.push("");
      break;
    }

    case "permission.updated": {
      const title = props.title as string;
      endStreaming(state);
      lines.push(`${chalk.yellow("Permission:")} ${title}`);
      break;
    }

    case "permission.replied": {
      const reply = (props.reply ?? props.response ?? "") as string;
      const label =
        reply === "reject" ? chalk.red("Rejected") : chalk.green(`Permitted (${reply})`);
      lines.push(label);
      break;
    }

    // ================================================================
    // QUESTIONS
    // ================================================================
    case "question.asked": {
      const questions = (props.questions ?? []) as Record<string, unknown>[];
      const requestId = props.id as string;

      endStreaming(state);
      lines.push("");
      for (const q of questions) {
        const question = q.question as string;
        const header = q.header as string;
        const qOptions = (q.options ?? []) as Record<string, unknown>[];
        const multiple = q.multiple as boolean;

        lines.push(`${chalk.yellow.bold("Question:")} ${chalk.white(question)}`);
        if (header) lines.push(`  ${chalk.dim(header)}`);

        for (let i = 0; i < qOptions.length; i++) {
          const opt = qOptions[i];
          const label = opt.label as string;
          const desc = opt.description as string;
          lines.push(
            `  ${chalk.cyan(`${i + 1}.`)} ${chalk.white(label)}${desc ? chalk.dim(` — ${desc}`) : ""}`,
          );
        }

        if (multiple) {
          lines.push(chalk.dim("  (multiple selections allowed)"));
        }
      }
      lines.push(chalk.dim(`  oc-cli session answer ${requestId} "your answer"`));
      lines.push(chalk.dim(`  oc-cli session reject ${requestId}`));
      lines.push("");
      break;
    }

    case "question.replied": {
      const answers = (props.answers ?? []) as string[][];
      lines.push(`${chalk.green("Answered:")} ${chalk.dim(JSON.stringify(answers))}`);
      break;
    }

    case "question.rejected": {
      lines.push(chalk.red("Question rejected"));
      break;
    }

    // ================================================================
    // TODOS
    // ================================================================
    case "todo.updated": {
      const todos = (props.todos ?? []) as Record<string, unknown>[];
      if (todos.length === 0) return [];
      for (const todo of todos) {
        const todoStatus = todo.status as string;
        const icon =
          todoStatus === "completed"
            ? chalk.green("✓")
            : todoStatus === "in_progress"
              ? chalk.yellow("▸")
              : todoStatus === "cancelled"
                ? chalk.dim("✗")
                : chalk.dim("○");
        lines.push(`  ${icon} ${todo.content as string}`);
      }
      break;
    }

    // ================================================================
    // SUPPRESS everything else
    // ================================================================
    default:
      return [];
  }

  if (lines.length > 0) {
    state.hasOutput = true;
  }

  return lines;
}
