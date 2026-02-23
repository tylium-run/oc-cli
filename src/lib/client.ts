// This module creates and exports the OpenCode SDK client.
//
// WHY a separate file?
// Instead of creating the client in every command file, we create
// it once here and import it everywhere. This is called the "single
// responsibility principle" — this file's only job is to set up the client.
//
// CHANGE: The client is no longer a static export. It's now created via
// getClient(), which accepts a baseUrl. This lets the config system
// control which server we connect to.
//
// We cache the client instance so it's only created once per CLI run.

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

let cachedClient: OpencodeClient | null = null;
let cachedBaseUrl: string | null = null;

/**
 * Get (or create) the SDK client for the given base URL.
 *
 * On the first call, creates a new client and caches it.
 * Subsequent calls return the cached client (unless the URL changes,
 * which shouldn't happen in normal CLI usage).
 */
export function getClient(baseUrl: string): OpencodeClient {
  if (cachedClient && cachedBaseUrl === baseUrl) {
    return cachedClient;
  }
  cachedClient = createOpencodeClient({ baseUrl });
  cachedBaseUrl = baseUrl;
  return cachedClient;
}
