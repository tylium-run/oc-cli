// This module creates and exports the OpenCode SDK client.
//
// Uses the v2 SDK (@opencode-ai/sdk/v2) which has a cleaner API
// (flat params instead of {path, body, query}) plus client.permission
// and client.question endpoints.
//
// When a directory is provided, it sets the x-opencode-directory header
// on every request from this client, scoping all operations to that project.

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";

let cachedClient: OpencodeClient | null = null;
let cachedKey: string | null = null;

/**
 * Get (or create) the SDK client for the given base URL and optional directory.
 *
 * On the first call, creates a new client and caches it.
 * Subsequent calls return the cached client (unless the URL or directory changes).
 *
 * When `directory` is provided, the SDK sets an `x-opencode-directory` header
 * on every request, scoping operations to that project on the server.
 */
export function getClient(baseUrl: string, directory?: string): OpencodeClient {
  const key = `${baseUrl}|${directory ?? ""}`;
  if (cachedClient && cachedKey === key) {
    return cachedClient;
  }
  cachedClient = createOpencodeClient({ baseUrl, directory });
  cachedKey = key;
  return cachedClient;
}
