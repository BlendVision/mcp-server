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
 *                                    [--include <"METHOD path" regex>]
 *
 * --actions reads each operation's declared `auth_options.action` out of the
 * .proto sources and records it on the index. call_api's write guard needs it:
 * the method alone does not say whether a call mutates anything, because 28 of
 * the CXM operations are POST with ACTION_READ (batch-get, report generation,
 * aggregation). Guarding on the method would refuse all of those.
 *
 * --include keeps only the operations whose "METHOD path" matches a regex, or,
 * as `--include @file`, whose "METHOD path" is listed in that file (one per
 * line, `#` comments allowed) -- a curated slice is easier to review as a list
 * of endpoints than as one long regex. A spec can be far wider than
 * what an index should expose -- the internal spec carries 342 CXM storefront
 * operations, and shipping all of them would publish the whole surface to pick
 * a handful of reads from. Naming the paths explicitly keeps the index to what
 * was actually reviewed.
 *
 * `definitions` is pruned to the schemas the kept operations can reach, so a
 * narrow slice of a wide spec stays narrow (the CXM slice is ~1% of the
 * internal spec's definitions).
 *
 * Which spec you compile decides what the server can reach. The repo ships an
 * index built from the BV_EXTERNAL-only public spec plus a reviewed slice of
 * the internal CXM storefront reads; pointing a deployment at an index built
 * from a wider spec is how it reaches more (see BLENDVISION_API_INDEX in
 * README).
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

/** "PublicAnalyticsService_ListMyPrograms" -> "List my programs". */
function labelFromOperationId(operationId) {
  if (!operationId) return '';

  const method = String(operationId).split('_').pop();
  const words = method.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
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

/**
 * The definitions reachable from a set of operations, transitively. Schemas
 * reference each other by $ref, so keeping only the directly-named ones would
 * leave describe_api unable to resolve a nested field.
 */
function reachableDefinitions(definitions, operations) {
  const kept = {};
  const queue = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        const name = value.replace('#/definitions/', '');
        if (definitions[name] && !(name in kept)) {
          kept[name] = definitions[name];
          queue.push(definitions[name]);
        }
        continue;
      }

      visit(value);
    }
  };

  operations.forEach(visit);

  while (queue.length) visit(queue.pop());

  return kept;
}

/**
 * The --include matcher: a regex as given, or an exact-match alternation of the
 * "METHOD path" lines in `@file`.
 */
function buildIncludeRe(value) {
  if (!value) return undefined;

  if (!value.startsWith('@')) return new RegExp(value);

  const lines = readFileSync(value.slice(1), 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error(`${value.slice(1)} lists no operations`);
  }

  const escaped = lines.map((line) => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return new RegExp(`^(?:${escaped.join('|')})$`);
}

function build(spec, actions = {}, includeRe) {
  const operations = [];

  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;

      const verb = method.toUpperCase();

      // Matched against "METHOD path", not the path alone: several paths serve
      // a read on GET and a create on POST, and a slice meant to expose the
      // read must not carry the create's schema along with it.
      if (includeRe && !includeRe.test(`${verb} ${path}`)) continue;

      operations.push({
        method: verb,
        path,
        // Absent when built without --actions; call_api then falls back to
        // treating any non-GET as mutating, which errs toward refusing.
        action: actions[`${verb} ${path}`],
        operationId: op.operationId,
        // Prefer the explicit summary; fall back to the description's first
        // sentence, then to the operation id, so an operation is never indexed
        // with an empty label -- search_api ranks on this line, and a blank one
        // is unfindable by anything but its path.
        summary: op.summary || firstLine(op.description) || labelFromOperationId(op.operationId),
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
    // Definitions stay by name rather than being inlined into the operations:
    // describe_api resolves the $refs lazily, and the same schema is referenced
    // by many operations, so inlining would multiply it.
    info: {
      title: spec.info?.title,
      version: spec.info?.version,
      operationCount: operations.length,
    },
    operations,
    definitions: reachableDefinitions(spec.definitions || {}, operations),
  };
}

const args = process.argv.slice(2);
const outFlag = args.indexOf('-o');
const actionsFlag = args.indexOf('--actions');
const includeFlag = args.indexOf('--include');
const out = outFlag === -1 ? 'data/api-index.json' : args[outFlag + 1];
// Only the flags actually present consume the argument after them; `indexOf`
// returns -1 for an absent flag, and -1 + 1 is index 0 -- the spec itself.
const flagValues = new Set(
  [outFlag, actionsFlag, includeFlag].filter((i) => i !== -1).map((i) => i + 1)
);
const input = args.find((a, i) => !a.startsWith('-') && !flagValues.has(i));

if (!input) {
  console.error(
    'usage: build-api-index.mjs <spec.yaml|spec.json> [-o out.json] ' +
      '[--actions <proto-dir>] [--include <"METHOD path" regex>|@file]'
  );
  process.exit(1);
}

const includeRe = buildIncludeRe(includeFlag === -1 ? undefined : args[includeFlag + 1]);
const actions = actionsFlag === -1 ? {} : actionsFromProtos(args[actionsFlag + 1]);
const index = build(loadSpec(input), actions, includeRe);
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
