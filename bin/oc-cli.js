#!/usr/bin/env node

// This is the entry point when someone runs `oc-cli` from the terminal.
// The first line (#!/usr/bin/env node) is called a "shebang" — it tells
// the operating system: "run this file using Node.js, not bash or python."
//
// All this file does is import the compiled TypeScript output.

import "../dist/index.js";
