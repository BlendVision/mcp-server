#!/usr/bin/env node
/**
 * Compiles an OpenAPI v2 (swagger) spec into the compact index the api tools
 * search over.
 *
 * The spec itself is far too large to hand to a model -- BlendVision's is
 * megabytes across a thousand operations -- and `tools/list` is sent on every
 * conversation, so exposing one MCP tool per endpoint would cost more context
 * than the work itself. The index keeps one line per operation for searching,
 * and the full parameter detail beside it for describe_api to pull on demand.
 *
 * Usage:
 *   node scripts/build-api-index.mjs <spec.yaml|spec.json> [-o out.json]
 *                                    [--actions <proto-dir>]
 *
 * --actions reads each operation's declared `auth_options.action` out of the
 * .proto sources and records it on the index. call_api's write guard needs it:
 * the method alone does not say whether a call mutates anything, because 28 of
 * the CXM operations are POST with ACTION_READ (batch-get, report generation,
 * aggregation). Guarding on the method would refuse all of those.
 *
 * Which spec you compile decides what the server can reach. The repo ships an
 * index built from the BV_EXTERNAL-only public spec; pointing a deployment at
 * an index built from a wider spec is how it reaches more (see
 * BLENDVISION_API_INDEX in README).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const METHODS = ['get', 'put', 'post', 'delete', 'patch'];

function loadSpec(file) {
  const raw = readFileSync(file, 'utf8');

  if (file.endsWith('.json')) {
    return JSON.parse(raw);
  }

  return parseYaml(raw);
}

/** First sentence of a description, for the one-line search result. */
function firstLine(text) {
  if (!text) return '';

  // These specs use `----` as a section break and repeat the field list below
  // it; everything after the break is detail describe_api can show instead.
  const head = String(text).split('\n----')[0].trim();
  const stop = head.search(/[.!?](\s|$)/);

  return (stop === -1 ? head : head.slice(0, stop + 1)).replace(/\s+/g, ' ').trim();
}

/** Every .proto under a directory, recursively. */
function protoFiles(dir) {
  const out = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      out.push(...protoFiles(full));
    } else if (entry.endsWith('.proto')) {
      out.push(full);
    }
  }

  return out;
}

/**
 * Maps "METHOD path" to the action the RPC declares, by reading the protos.
 *
 * The OpenAPI generator drops `auth_options`, so the spec cannot answer this --
 * it has to come from the source.
 */
function actionsFromProtos(dir) {
  const actions = {};

  for (const file of protoFiles(dir)) {
    const source = readFileSync(file, 'utf8');

    // Each rpc block, up to its closing brace at rpc indentation.
    for (const block of source.match(/\n  rpc \w+[\s\S]*?\n  \}/g) || []) {
      const action = block.match(/action:\s*(ACTION_\w+)/);
      if (!action) continue;

      for (const rule of block.matchAll(/(get|post|put|patch|delete):\s*"([^"]+)"/g)) {
        actions[`${rule[1].toUpperCase()} ${rule[2]}`] = action[1];
      }
    }
  }

  return actions;
}

function build(spec, actions = {}) {
  const operations = [];

  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;

      const verb = method.toUpperCase();

      operations.push({
        method: verb,
        path,
        // Absent when built without --actions; call_api then falls back to
        // treating any non-GET as mutating, which errs toward refusing.
        action: actions[`${verb} ${path}`],
        operationId: op.operationId,
        // Prefer the explicit summary; fall back to the description's first
        // sentence so an operation is never indexed with an empty label.
        summary: op.summary || firstLine(op.description),
        description: op.description || undefined,
        tags: op.tags,
        parameters: op.parameters,
        responses: op.responses
          ? Object.fromEntries(
              Object.entries(op.responses).map(([code, r]) => [
                code,
                { description: r.description, schema: r.schema },
              ])
            )
          : undefined,
      });
    }
  }

  operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return {
    // `definitions` is kept whole: parameters reference it by $ref, and
    // describe_api resolves those lazily rather than inlining them here (the
    // same schema is referenced by many operations, so inlining multiplies it).
    info: {
      title: spec.info?.title,
      version: spec.info?.version,
      operationCount: operations.length,
    },
    operations,
    definitions: spec.definitions || {},
  };
}

const args = process.argv.slice(2);
const outFlag = args.indexOf('-o');
const actionsFlag = args.indexOf('--actions');
const out = outFlag === -1 ? 'data/api-index.json' : args[outFlag + 1];
const input = args.find(
  (a, i) => !a.startsWith('-') && i !== outFlag + 1 && i !== actionsFlag + 1
);

if (!input) {
  console.error('usage: build-api-index.mjs <spec.yaml|spec.json> [-o out.json]');
  process.exit(1);
}

const actions = actionsFlag === -1 ? {} : actionsFromProtos(args[actionsFlag + 1]);
const index = build(loadSpec(input), actions);
writeFileSync(out, JSON.stringify(index));

const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)}KB`;
console.error(`${input} -> ${out}`);
console.error(`  operations:  ${index.info.operationCount}`);
console.error(`  definitions: ${Object.keys(index.definitions).length}`);
console.error(`  index size:  ${kb(JSON.stringify(index))}`);

if (actionsFlag !== -1) {
  const withAction = index.operations.filter((o) => o.action).length;
  const mutating = index.operations.filter((o) => o.action && o.action !== 'ACTION_READ').length;
  console.error(`  actions:     ${withAction} resolved (${mutating} mutating)`);

  if (withAction < index.operations.length) {
    console.error(`  WARNING:     ${index.operations.length - withAction} operations have no action;`);
    console.error(`               call_api will fall back to the method for those`);
  }
}
