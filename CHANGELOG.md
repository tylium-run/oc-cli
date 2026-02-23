# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 — 2025-06-23

Initial release.

### Features

- **Profile-based configuration** — manage connections to multiple OpenCode servers and projects via `~/.oc-cli.json`
- **Profile commands** — `profile add`, `profile list`, `profile show`, `profile remove`, `profile set`
- **Session management** — `session list`, `session create`, `session delete`, `session messages`
- **Send prompts** — `session prompt` with inline text, `--file`, or `--stdin` input
- **Prompt options** — `--model`, `--agent`, `--tools`, `--no-reply` flags
- **Real-time streaming** — `watch` command for SSE event streaming with session/type filtering
- **Agent interaction** — `session permit`, `session answer`, `session reject` for handling permission and question events
- **Model listing** — `models` command with `--all` for full server catalog
- **Global config** — `config set/get/list/path` for shared settings like `titlePrefix`
- **JSON-first output** — compact JSON by default, `--pretty` for human-readable tables
- **Output filtering** — `--fields` for column selection, `--filter` for row filtering
- **Title tagging** — auto-appends `[profileName]` to global title prefix for session identification
