#!/usr/bin/env node

import { buildRegistry, configFromEnv } from './registry.js';
import type { BlendVisionConfig } from './types.js';

/**
 * BlendVision CLI
 *
 * A thin command-line wrapper around the same tool registry used by the
 * MCP server. Designed to be easy for both humans and AI agents to drive.
 *
 *   blendvision list                       # list every tool (name + description)
 *   blendvision list --json                # full JSON schemas for every tool
 *   blendvision schema <tool>              # input schema for one tool
 *   blendvision call <tool> [params...]    # invoke a tool
 *   blendvision <tool> [params...]         # shorthand for `call`
 *
 * Passing parameters:
 *   --key value        --key=value        (values are JSON-parsed, falling back to string)
 *   --flag             (boolean true)
 *   --json '{...}'     (whole params object as JSON; merged over --key flags)
 *   --stdin            (read the JSON params object from stdin)
 *
 * Global flags (override BLENDVISION_* env vars):
 *   --token <t>   --org <id>   --base-url <url>
 *
 * Output: the tool result is printed to stdout. On error the process exits 1.
 */

const USAGE = `BlendVision CLI

Usage:
  blendvision list [--json]            List all tools (use --json for full schemas)
  blendvision schema <tool>            Show the input schema for one tool
  blendvision call <tool> [params]     Invoke a tool
  blendvision <tool> [params]          Shorthand for "call <tool>"

Parameters:
  --key value | --key=value            A single parameter (JSON-parsed, else string)
  --flag                               Boolean true
  --json '{"k":"v"}'                   Whole params object as JSON (merged over flags)
  --stdin                              Read the JSON params object from stdin

Global flags (override env vars):
  --token <token>                      BLENDVISION_API_TOKEN
  --org <orgId>                        BLENDVISION_ORG_ID
  --base-url <url>                     BLENDVISION_BASE_URL
  -h, --help                           Show this help

Env vars: BLENDVISION_API_TOKEN (required), BLENDVISION_ORG_ID, BLENDVISION_BASE_URL`;

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/** Best-effort coercion: JSON value if parseable, otherwise the raw string. */
function coerce(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

interface ParsedArgs {
  globals: Partial<BlendVisionConfig>;
  positionals: string[];
  params: Record<string, any>;
  json?: string;
  useStdin: boolean;
  listJson: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const globals: Partial<BlendVisionConfig> = {};
  const positionals: string[] = [];
  const params: Record<string, any> = {};
  let json: string | undefined;
  let useStdin = false;
  let listJson = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (arg === '--stdin') {
      useStdin = true;
      continue;
    }

    if (arg.startsWith('--')) {
      let key = arg.slice(2);
      let value: string | undefined;

      const eq = key.indexOf('=');
      if (eq !== -1) {
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        value = argv[++i];
      }

      switch (key) {
        case 'token':
          globals.apiToken = value;
          break;
        case 'org':
          globals.organizationId = value;
          break;
        case 'base-url':
          globals.baseUrl = value;
          break;
        case 'json':
          if (value !== undefined) json = value;
          else listJson = true; // `list --json`
          break;
        default:
          // Boolean flag if no value was supplied.
          params[key] = value === undefined ? true : coerce(value);
      }
      continue;
    }

    positionals.push(arg);
  }

  return { globals, positionals, params, json, useStdin, listJson, help };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help || parsed.positionals.length === 0) {
    console.log(USAGE);
    process.exit(parsed.help ? 0 : 1);
  }

  // Resolve config: env vars overridden by global flags.
  const config: BlendVisionConfig = { ...configFromEnv(), ...parsed.globals };

  let command = parsed.positionals[0];
  let toolName: string | undefined;

  // `call <tool>` vs `<tool>` shorthand.
  if (command === 'call') {
    toolName = parsed.positionals[1];
  } else if (command === 'list' || command === 'tools') {
    command = 'list';
  } else if (command === 'schema' || command === 'describe') {
    command = 'schema';
    toolName = parsed.positionals[1];
  } else {
    toolName = command;
    command = 'call';
  }

  // The registry can be built without a token for list/schema (no API calls).
  if (command === 'call' && !config.apiToken) {
    console.error('Error: BLENDVISION_API_TOKEN is required (set the env var or pass --token).');
    process.exit(1);
  }

  const { registry } = buildRegistry(config);

  if (command === 'list') {
    const tools = registry.getAllTools();
    if (parsed.listJson) {
      console.log(JSON.stringify(tools, null, 2));
    } else {
      for (const t of tools) {
        console.log(`${t.name}\n    ${t.description ?? ''}`);
      }
      console.error(`\n${tools.length} tools`);
    }
    return;
  }

  if (command === 'schema') {
    if (!toolName) {
      console.error('Error: schema requires a tool name. Run "blendvision list".');
      process.exit(1);
    }
    const tool = registry.getTool(toolName);
    if (!tool) {
      console.error(`Error: unknown tool "${toolName}". Run "blendvision list".`);
      process.exit(1);
    }
    console.log(JSON.stringify(tool, null, 2));
    return;
  }

  // command === 'call'
  if (!toolName) {
    console.error('Error: no tool specified. Run "blendvision list".');
    process.exit(1);
  }

  const handler = registry.getHandler(toolName);
  if (!handler) {
    console.error(`Error: unknown tool "${toolName}". Run "blendvision list".`);
    process.exit(1);
  }

  // Assemble params: flags first, then --json / --stdin overrides on top.
  let params: Record<string, any> = { ...parsed.params };

  if (parsed.useStdin) {
    const raw = (await readStdin()).trim();
    if (raw) params = { ...params, ...JSON.parse(raw) };
  }
  if (parsed.json !== undefined) {
    params = { ...params, ...JSON.parse(parsed.json) };
  }

  const result = await handler(params);

  // Handlers return MCP-shaped results: { content: [{type:'text', text}], isError? }
  const text = (result?.content ?? [])
    .map((c: any) => c.text ?? '')
    .join('\n');

  if (text) console.log(text);

  if (result?.isError) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
