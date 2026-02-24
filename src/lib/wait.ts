// Wait utility: subscribe to SSE events and block until a session reaches
// a terminal state (idle or error).
//
// This encapsulates the SSE subscribe → filter → wait loop into a clean,
// reusable function. The primary consumer is the `run` command, which fires
// a prompt and then needs to block until the session finishes processing.
//
// Terminal states:
//   - session.idle   → success (the session finished and is waiting for input)
//   - session.error  → failure (the session hit an unrecoverable error)
//
// Optionally streams events to stderr (--stream mode) so stdout stays clean
// for the final JSON result.

import { type OpencodeClient } from "@opencode-ai/sdk/v2";
import { formatEvent, createFormatterState } from "./format-event.js";

// ---- Types ----

export interface WaitResult {
  status: "idle" | "error" | "timeout";
  /** Error message when status is "error" (from session.error event). */
  error?: string;
  /** The raw terminal event that caused the wait to end. */
  event?: Record<string, unknown>;
}

export interface WaitOptions {
  /** Timeout in seconds. undefined = no timeout. */
  timeout?: number;
  /** AbortSignal for external cancellation (Ctrl+C). */
  signal?: AbortSignal;
  /** If true, emit SSE events to stderr while waiting (--stream mode). */
  stream?: boolean;
  /** If true, use pretty formatting for streamed events. */
  pretty?: boolean;
  /** If true, auto-reply "always" to permission.asked events. */
  autoApprove?: boolean;
}

// ---- Helpers ----

/**
 * Check whether an SSE event belongs to the given session.
 *
 * Events carry the session ID in different locations depending on type:
 *   - properties.sessionID (message.part.delta, session.status, etc.)
 *   - properties.info.id (session.created/updated/deleted)
 *   - properties.info.sessionID (message.updated)
 *   - properties.part.sessionID (message.part.updated)
 */
function eventMatchesSession(evt: Record<string, unknown>, targetSessionId: string): boolean {
  const p = (evt.properties ?? {}) as Record<string, unknown>;
  if (p.sessionID === targetSessionId) return true;
  const info = p.info as Record<string, unknown> | undefined;
  if (info?.id === targetSessionId) return true;
  if (info?.sessionID === targetSessionId) return true;
  const part = p.part as Record<string, unknown> | undefined;
  if (part?.sessionID === targetSessionId) return true;
  return false;
}

// ---- Main ----

/**
 * Subscribe to SSE events and wait for a session to reach a terminal state.
 *
 * Resolves with `{ status: "idle" }` on success, `{ status: "error", error }` on
 * session failure, or `{ status: "timeout" }` if the timeout expires.
 *
 * @param client    - The OpenCode SDK client (already configured with baseUrl/directory).
 * @param sessionId - The session to watch.
 * @param options   - Timeout, abort signal, and streaming preferences.
 */
export async function waitForSession(
  client: OpencodeClient,
  sessionId: string,
  options?: WaitOptions,
): Promise<WaitResult> {
  const controller = new AbortController();

  // Chain external signal (Ctrl+C) so aborting the outer signal also aborts our SSE connection.
  if (options?.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  // Timeout handling — set a flag so we can distinguish timeout from Ctrl+C.
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (options?.timeout) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeout * 1000);
  }

  // Optional streaming state.
  const fmtState = options?.stream ? createFormatterState(process.stderr) : null;

  try {
    const { stream } = await client.event.subscribe(undefined, {
      signal: controller.signal,
    } as Parameters<typeof client.event.subscribe>[1]);

    for await (const event of stream) {
      const evt = event as unknown as Record<string, unknown>;
      const type = evt.type as string;

      // Skip events not for our session (except server.connected which is global).
      if (type !== "server.connected" && !eventMatchesSession(evt, sessionId)) {
        continue;
      }

      // Optional: stream events to stderr so stdout stays clean for final JSON.
      if (options?.stream && fmtState) {
        if (options.pretty) {
          const lines = formatEvent(evt, fmtState);
          for (const line of lines) {
            process.stderr.write(line + "\n");
          }
        } else {
          process.stderr.write(JSON.stringify(event) + "\n");
        }
      }

      // Auto-approve permission requests when --auto-approve is set.
      if (type === "permission.asked" && options?.autoApprove) {
        const props = (evt.properties ?? {}) as Record<string, unknown>;
        const requestId = props.id as string;
        if (requestId) {
          await client.permission.reply({
            requestID: requestId,
            reply: "always",
          });
        }
      }

      // Check for terminal states.
      if (type === "session.idle") {
        return { status: "idle", event: evt };
      }

      if (type === "session.error") {
        const props = (evt.properties ?? {}) as Record<string, unknown>;
        const err = props.error as Record<string, unknown>;
        const errData = err?.data as Record<string, unknown> | undefined;
        const message = (errData?.message ?? err?.message ?? "Unknown error") as string;
        return { status: "error", error: message, event: evt };
      }
    }

    // Stream ended without a terminal event — shouldn't normally happen.
    return { status: "error", error: "SSE stream ended unexpectedly" };
  } catch (error) {
    // AbortError is expected from timeout or Ctrl+C.
    if ((error as Error).name === "AbortError") {
      if (timedOut) {
        return { status: "timeout" };
      }
      // External signal (Ctrl+C) — re-throw so the caller can handle it.
      throw error;
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
