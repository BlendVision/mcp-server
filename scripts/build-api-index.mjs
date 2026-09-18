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
 *
 * Which spec you compile decides what the server can reach. The repo ships an
 * index built from the BV_EXTERNAL-only public spec; pointing a deployment at
 * an index built from a wider spec is how it reaches more (see
 * BLENDVISION_API_INDEX in README).
 */

import { readFileSync, writeFileSync } from 'node:fs';
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

function build(spec) {
  const operations = [];

  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;

      operations.push({
        method: method.toUpperCase(),
        path,
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
const out = outFlag === -1 ? 'data/api-index.json' : args[outFlag + 1];
const input = args.find((a, i) => !a.startsWith('-') && i !== outFlag + 1);

if (!input) {
  console.error('usage: build-api-index.mjs <spec.yaml|spec.json> [-o out.json]');
  process.exit(1);
}

const index = build(loadSpec(input));
writeFileSync(out, JSON.stringify(index));

const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)}KB`;
console.error(`${input} -> ${out}`);
console.error(`  operations:  ${index.info.operationCount}`);
console.error(`  definitions: ${Object.keys(index.definitions).length}`);
console.error(`  index size:  ${kb(JSON.stringify(index))}`);
