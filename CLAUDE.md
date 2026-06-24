# CLAUDE.md

## BlendVision CLI

This project ships a CLI (`blendvision`) that exposes the same tools as the MCP
server. Prefer it for one-off API calls from the shell.

- Discover tools: `blendvision list` (add `--json` for full schemas)
- Inspect one tool: `blendvision schema <tool>`
- Invoke: `blendvision call <tool> --json '{…}'` (or `--key value` flags)

Output is JSON on stdout; exit code is `1` on error. See [CLI.md](CLI.md) for details.
Requires `BLENDVISION_API_TOKEN` in the environment.
