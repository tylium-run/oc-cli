// This module creates and exports the OpenCode SDK client.
//
// CHANGE: Switched from the v1 SDK import (@opencode-ai/sdk) to v2
// (@opencode-ai/sdk/v2). Both are in the same npm package — v2 has
// a cleaner API (flat params instead of {path, body, query}) plus
// client.permission and client.question endpoints.

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";

let cachedClient: OpencodeClient | null = null;
let cachedBaseUrl: string | null = null;

/**
 * Get (or create) the SDK client for the given base URL.
 *
 * On the first call, creates a new client and caches it.
 * Subsequent calls return the cached client (unless the URL changes).
 */
export function getClient(baseUrl: string): OpencodeClient {
  if (cachedClient && cachedBaseUrl === baseUrl) {
    return cachedClient;
  }
  cachedClient = createOpencodeClient({ baseUrl });
  cachedBaseUrl = baseUrl;
  return cachedClient;
}
