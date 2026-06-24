# BlendVision CLI

The same BlendVision One tools exposed by the MCP server, available as a plain
command-line program. The CLI and MCP server share one tool registry
([src/registry.ts](src/registry.ts)), so they always expose the identical tool set.

## Install / build

```bash
npm install
npm run build          # compiles to build/
npm link               # optional: puts `blendvision` on your PATH
```

Without `npm link`, invoke it as `node build/cli.js …`.

## Configuration

Set via env vars (or override per-call with flags):

| Env var                  | Flag          | Required |
|--------------------------|---------------|----------|
| `BLENDVISION_API_TOKEN`  | `--token`     | yes (for calls) |
| `BLENDVISION_ORG_ID`     | `--org`       | no       |
| `BLENDVISION_BASE_URL`   | `--base-url`  | no       |

## Commands

```bash
blendvision list                 # every tool: name + description
blendvision list --json          # full JSON schemas (machine-readable)
blendvision schema <tool>        # input schema for one tool
blendvision call <tool> [params] # invoke a tool
blendvision <tool> [params]      # shorthand for `call`
```

### Passing parameters

```bash
# individual flags — values are JSON-parsed, falling back to string
blendvision list_videos --pageSize 10 --keyword demo

# a whole JSON object (best for nested params)
blendvision create_video --json '{"name":"My Video","security":{"drm":true}}'

# read the JSON params object from stdin
echo '{"resourceId":"abc","resourceType":"VOD"}' | blendvision generate_playback_token --stdin

# override config inline
blendvision list_videos --org org_123 --token "$TOKEN"
```

Output (a JSON document) goes to **stdout**. The process exits `1` when the tool
returns an error, `0` on success — so it composes with shell `&&`, `jq`, etc.

```bash
blendvision list_videos --pageSize 5 | jq '.data[].name'
```

## How an AI agent uses it

An agent drives the CLI in three steps — discover, inspect, invoke:

1. **Discover** the available tools and their schemas in one shot:

   ```bash
   blendvision list --json
   ```

   This returns the same `{name, description, inputSchema}` objects the MCP
   server advertises — the agent feeds them straight into its tool-planning.

2. **Inspect** a specific tool before calling (optional once schemas are known):

   ```bash
   blendvision schema list_videos
   ```

3. **Invoke** with parameters as a JSON object (most reliable for agents):

   ```bash
   blendvision call list_videos --json '{"pageSize":10}'
   ```

   The agent reads stdout (JSON) and checks the exit code (`0` ok / `1` error).

### Interface contract (for programmatic / Agent SDK use)

The CLI guarantees the following so a program can drive it reliably:

| Command | stdout | exit |
| --- | --- | --- |
| `list --json` | JSON array of `{name, description, inputSchema}` (53 tools) | `0` |
| `schema <tool>` | JSON object for that tool | `0` |
| `call <tool> --json '{…}'` (ok) | tool result as JSON | `0` |
| `call <tool> …` (API/tool error) | JSON with an `error` field | `1` |
| unknown tool / bad usage | (message on **stderr**) | `1` |

- **Data goes to stdout, diagnostics go to stderr** — read them separately.
- **Exit `0` = success, `1` = failure.** A failed API call still prints a JSON
  body (with `error`) to stdout *and* exits `1`, so a non-zero exit always means
  "do not trust this as a success".
- `list` / `schema` need no token; `call` requires `BLENDVISION_API_TOKEN`
  (pass it through to the child process's environment).

### Wiring it into an agent

- **Generic / function-calling agents:** expose one shell tool, e.g.
  `run_blendvision(args: string[])`, that executes `blendvision <args>`. Seed the
  agent's system prompt with the output of `blendvision list --json` so it knows
  the catalog, then let it call `blendvision call <tool> --json '<params>'`.

- **Claude Code / Codex / any CLI-calling agent:** just allow the `blendvision`
  command. Tell the agent: "run `blendvision list` to see tools, `blendvision
  schema <tool>` for parameters, and `blendvision call <tool> --json '{…}'` to
  run one." No MCP wiring required.

- **Still want MCP?** It's unchanged — `blendvision-mcp` (stdio) and
  `blendvision-connector` (HTTP) still work. The CLI is an additional entry
  point, not a replacement.
