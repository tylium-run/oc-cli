// This module creates and exports the OpenCode SDK client.
//
// WHY a separate file?
// Instead of creating the client in every command file, we create
// it once here and import it everywhere. This is called the "single
// responsibility principle" — this file's only job is to set up the client.
//
// HOW IMPORTS/EXPORTS WORK:
// - `export` makes something available to other files
// - Other files use `import { client } from "./lib/client.js"` to get it
// - Note the `.js` extension — TypeScript with Node16 modules requires it,
//   even though the source file is `.ts`. TypeScript resolves it correctly.

import { createOpencodeClient } from "@opencode-ai/sdk";

// Create the client instance.
// The SDK connects to the OpenCode server's HTTP API.
// We point it at the server URL. Later we can make this configurable
// via environment variables or a config file.
export const client = createOpencodeClient({
  baseUrl: "https://devs-mac-mini.taild2246a.ts.net:4096",
});
