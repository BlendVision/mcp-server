import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseTool } from './base_tool.js';
import { ToolRegistry } from './tool_registry.js';

/**
 * API Tools
 *
 * Three tools that stand in for the whole REST surface, instead of one tool per
 * endpoint. `tools/list` is sent on every conversation, so a tool per endpoint
 * would spend more context on the catalogue than on the work; search_api pays
 * only for the handful of lines a query matches, and describe_api pays for one
 * operation's schema when it is actually needed.
 *
 * The hand-written tools elsewhere in this server are still the better route
 * where they exist: they encode multi-step work (upload_file drives a three-step
 * upload, PUTting bytes to presigned URLs -- something call_api cannot express)
 * and validated arguments. These are for the long tail.
 *
 * Which endpoints are reachable is decided by the compiled index, not by this
 * code: `data/api-index.json` ships built from the public (BV_EXTERNAL) spec,
 * and BLENDVISION_API_INDEX points at a different one.
 */

const METHODS = ['GET', 'PUT', 'POST', 'DELETE', 'PATCH'];

// Dropped from queries: they match everywhere and rank nothing.
const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'in', 'on', 'by', 'and', 'or', 'my', 'me', 'all']);

/**
 * Words the product uses that the API spells differently. Without these a
 * perfectly reasonable query misses the endpoint sitting right there: there is
 * no "channel" anywhere in the spec (live endpoints are `lives`), and no
 * "video" in the VOD paths (`vods`). Kept deliberately short -- it is a
 * vocabulary bridge, not a thesaurus.
 */
const SYNONYMS: Record<string, string[]> = {
  channel: ['live'],
  video: ['vod'],
  videos: ['vods'],
  captions: ['subtitle'],
  caption: ['subtitle'],
  thumbnail: ['cover', 'screenshot'],
  organisation: ['organization', 'org'],
};

interface Operation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: any[];
  responses?: Record<string, { description?: string; schema?: any }>;
}

interface ApiIndex {
  info: { title?: string; version?: string; operationCount: number };
  operations: Operation[];
  definitions: Record<string, any>;
}

export class ApiTools extends BaseTool {
  private index?: ApiIndex;
  private indexError?: string;

  static registerTools(registry: ToolRegistry, instance: ApiTools): void {
    const orgIdProperty = {
      orgId: {
        type: 'string' as const,
        description: 'Organization ID (optional - uses environment variable BLENDVISION_ORG_ID if not provided)'
      }
    };

    registry.register(
      {
        name: 'search_api',
        description:
          'Search the BlendVision REST API for endpoints by keyword, returning one line per match ' +
          '(method, path, summary). Use this to find an endpoint that has no dedicated tool, then ' +
          'describe_api for its schema and call_api to invoke it. Prefer a dedicated tool when one ' +
          'exists — they handle multi-step work this cannot.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Keywords to match against path, summary and tags, e.g. "list vod subtitles" or "program progress".'
            },
            limit: { type: 'number', description: 'Maximum results, 1-50. Defaults to 20.' },
          },
          required: ['query'],
        },
      },
      async (params) => instance.searchApi(params)
    );

    registry.register(
      {
        name: 'describe_api',
        description:
          'Show one API endpoint in full: description, parameters, request body schema and responses, ' +
          'with $refs resolved. Call this before call_api so the request is built from the real schema.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Endpoint path as returned by search_api, e.g. /bv/cms/v1/vods/{id}.'
            },
            method: {
              type: 'string',
              description: 'HTTP method. Optional when the path has only one.'
            },
            includeResponses: {
              type: 'boolean',
              description:
                'Include full response schemas. Off by default because they are large and are ' +
                'not needed to build the request; the summary lists the top-level fields.'
            },
          },
          required: ['path'],
        },
      },
      async (params) => instance.describeApi(params)
    );

    registry.register(
      {
        name: 'call_api',
        description:
          'Call a BlendVision REST endpoint directly. The method and path must exist in the API index. ' +
          'Path placeholders may be filled inline (/bv/cms/v1/vods/abc123) or passed as pathParams.',
        inputSchema: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: METHODS,
              description: 'HTTP method'
            },
            path: {
              type: 'string',
              description: 'Endpoint path, placeholders either filled in or supplied via pathParams.'
            },
            pathParams: {
              type: 'object',
              description: 'Values for {placeholders} in the path, e.g. {"id": "abc123"}.'
            },
            query: {
              type: 'object',
              description: 'Query string parameters.'
            },
            body: {
              type: 'object',
              description: 'JSON request body, for POST/PUT/PATCH.'
            },
            ...orgIdProperty,
          },
          required: ['method', 'path'],
        },
      },
      async (params) => instance.callApi(params)
    );
  }

  /**
   * Loaded on first use, not at startup: a deployment with a missing or broken
   * index should fail that call with a readable message, not refuse to serve
   * the hand-written tools.
   */
  private loadIndex(): ApiIndex {
    if (this.index) return this.index;
    if (this.indexError) throw new Error(this.indexError);

    const fromEnv = process.env.BLENDVISION_API_INDEX;
    const bundled = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'api-index.json');
    const file = fromEnv || bundled;

    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as ApiIndex;

      if (!Array.isArray(parsed.operations)) {
        throw new Error('no operations array');
      }

      this.index = parsed;
      return parsed;
    } catch (error) {
      this.indexError =
        `could not load the API index from ${file}` +
        `${fromEnv ? ' (BLENDVISION_API_INDEX)' : ''}: ` +
        `${error instanceof Error ? error.message : String(error)}`;
      throw new Error(this.indexError);
    }
  }

  async searchApi(params: any) {
    try {
      const index = this.loadIndex();
      const query = String(params.query || '').trim();

      if (!query) {
        throw new Error('query is required');
      }

      const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
      const terms = query
        .toLowerCase()
        .split(/[\s,/:_-]+/)
        .filter((t) => t && !STOPWORDS.has(t));

      if (terms.length === 0) {
        throw new Error(`nothing to search for in "${query}"`);
      }

      const scored = index.operations
        .map((op) => ({ op, ...scoreOperation(op, terms) }))
        .filter((r) => r.matched > 0)
        // Coverage first, weight second: an operation matching more of the
        // query outranks one matching a single word more emphatically.
        .sort(
          (a, b) =>
            b.matched - a.matched || b.score - a.score || a.op.path.length - b.op.path.length
        )
        .slice(0, limit);

      if (scored.length === 0) {
        return this.formatResponse({
          data: {
            query,
            matches: [],
            hint:
              `nothing matched in ${index.operations.length} indexed operations; ` +
              'try fewer or more general words',
          },
        });
      }

      return this.formatResponse({
        data: {
          query,
          // Reported so a truncated result set is visible rather than looking
          // like the whole answer.
          matched: scored.length,
          searched: index.operations.length,
          matches: scored.map(({ op, unmatched }) => ({
            method: op.method,
            path: op.path,
            summary: op.summary || undefined,
            tags: op.tags,
            // Surfaced because this API's vocabulary does not always match the
            // product's: "live channel" endpoints are all spelled `lives`, so a
            // caller should see which of their words carried no weight.
            unmatchedTerms: unmatched.length > 0 ? unmatched : undefined,
          })),
        },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async describeApi(params: any) {
    try {
      const index = this.loadIndex();
      const matches = findOperations(index, params.path, params.method);

      if (matches.length === 0) {
        throw new Error(
          `no indexed operation for ${params.method ? params.method + ' ' : ''}${params.path}; ` +
          'use search_api to find the path'
        );
      }

      if (matches.length > 1 && !params.method) {
        return this.formatResponse({
          data: {
            path: params.path,
            methods: matches.map((op) => op.method),
            hint: 'several methods on this path; pass `method` to pick one',
          },
        });
      }

      const op = matches[0];

      // Parameters are resolved in full -- they are what the request is built
      // from. Responses are summarised unless asked for: expanding them cost
      // 60k characters on a single VOD endpoint, which is the very thing these
      // tools exist to avoid.
      return this.formatResponse({
        data: {
          method: op.method,
          path: op.path,
          operationId: op.operationId,
          summary: op.summary,
          description: op.description,
          tags: op.tags,
          parameters: resolveRefs(op.parameters, index.definitions),
          responses: params.includeResponses
            ? resolveRefs(op.responses, index.definitions)
            : summarizeResponses(op.responses, index.definitions),
        },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async callApi(params: any) {
    try {
      const index = this.loadIndex();
      const method = String(params.method || '').toUpperCase();

      if (!METHODS.includes(method)) {
        throw new Error(`unsupported method: ${params.method}`);
      }

      const path = applyPathParams(String(params.path || ''), params.pathParams);

      if (!path.startsWith('/')) {
        throw new Error(`path must start with "/": ${path}`);
      }

      const remaining = path.match(/\{[^}]+\}/g);
      if (remaining) {
        throw new Error(
          `path still has unfilled placeholders: ${remaining.join(', ')}; ` +
          'fill them inline or pass pathParams'
        );
      }

      // Validated against the index rather than passed straight through, so a
      // hallucinated endpoint fails here with a searchable message instead of
      // becoming a confusing 404 from the API.
      const matches = findOperations(index, path, method);
      if (matches.length === 0) {
        throw new Error(
          `${method} ${path} is not in the API index; use search_api to find the right endpoint`
        );
      }

      const result = await this.client.request(method, path, params.body, {
        params: params.query,
        orgId: params.orgId,
      });

      return this.formatResponse(result);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

/**
 * Scores an operation against the query terms.
 *
 * Returns coverage (how many terms matched) alongside the weight, and does not
 * require every term to match. Demanding all of them looks tidier but fails the
 * obvious queries: nothing in this API is called a "channel" -- live endpoints
 * are all spelled `lives` -- so "live channel start" would score zero while
 * `/bv/cms/v1/lives/{id}:start` sat right there.
 */
function scoreOperation(op: Operation, terms: string[]): { score: number; matched: number; unmatched: string[] } {
  const path = op.path.toLowerCase();
  const summary = (op.summary || '').toLowerCase();
  const tags = (op.tags || []).join(' ').toLowerCase();
  const operationId = (op.operationId || '').toLowerCase();

  let score = 0;
  let matched = 0;
  const unmatched: string[] = [];

  for (const term of terms) {
    let hit = 0;

    // The term itself, then the API's own word for it, which scores slightly
    // lower so a literal match still wins.
    for (const [variant, weight] of [
      [term, 1],
      ...(SYNONYMS[term] || []).map((v) => [v, 0.75] as const),
    ] as Array<readonly [string, number]>) {
      // Path matches rank hardest: they are what the caller ultimately needs,
      // and a word in the path is a stronger signal than the same word in prose.
      if (path.includes(variant)) hit += 4 * weight;
      if (summary.includes(variant)) hit += 2 * weight;
      if (tags.includes(variant)) hit += 2 * weight;
      if (operationId.includes(variant)) hit += 1 * weight;
      // "delete a video" should reach DELETE, which lives in the method, not
      // anywhere in the text.
      if (op.method.toLowerCase() === variant) hit += 3 * weight;

      if (hit > 0) break;
    }

    if (hit === 0) {
      unmatched.push(term);
      continue;
    }

    matched += 1;
    score += hit;
  }

  return { score, matched, unmatched };
}

/** Matches a concrete or templated path, optionally narrowed by method. */
function findOperations(index: ApiIndex, path: string, method?: string): Operation[] {
  if (!path) return [];

  const wanted = method ? String(method).toUpperCase() : undefined;
  const candidates = index.operations.filter((op) => !wanted || op.method === wanted);

  const exact = candidates.filter((op) => op.path === path);
  if (exact.length > 0) return exact;

  // `/bv/cms/v1/vods/abc123` should also find the `{id}` template, so a caller
  // can pass the path it actually means to request.
  return candidates.filter((op) => templateToRegex(op.path).test(path));
}

function templateToRegex(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, (c) =>
    c === '{' || c === '}' ? c : `\\${c}`
  );
  // A path segment value cannot contain "/", so a placeholder matches one segment.
  return new RegExp(`^${escaped.replace(/\{[^}]+\}/g, '[^/]+')}$`);
}

function applyPathParams(path: string, pathParams?: Record<string, unknown>): string {
  if (!pathParams) return path;

  return path.replace(/\{([^}]+)\}/g, (whole, name) => {
    const value = pathParams[name];
    return value === undefined || value === null ? whole : encodeURIComponent(String(value));
  });
}

/**
 * Inlines `$ref` targets so a described operation is readable on its own.
 *
 * Depth-capped and cycle-aware: these schemas are mutually recursive, and the
 * definitions map is shared by every operation, so following refs without a
 * bound does not terminate.
 */
function resolveRefs(node: any, definitions: Record<string, any>, seen: string[] = [], depth = 0): any {
  if (node === null || typeof node !== 'object' || depth > 6) return node;

  if (Array.isArray(node)) {
    return node.map((item) => resolveRefs(item, definitions, seen, depth + 1));
  }

  const ref = node.$ref;
  if (typeof ref === 'string') {
    const name = ref.replace('#/definitions/', '');

    if (seen.includes(name)) {
      return { $ref: ref, note: 'recursive reference, not expanded again' };
    }

    const target = definitions[name];
    if (!target) return node;

    return {
      ...resolveRefs(target, definitions, [...seen, name], depth + 1),
      $refName: name,
    };
  }

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = resolveRefs(value, definitions, seen, depth + 1);
  }

  return out;
}

/**
 * Lists what a response contains without inlining the whole schema.
 *
 * The success schema alone runs to tens of thousands of characters on the
 * richer resources, so the default is field names and the caller asks for more
 * only if it matters.
 */
function summarizeResponses(
  responses: Operation['responses'],
  definitions: Record<string, any>
): Record<string, any> | undefined {
  if (!responses) return undefined;

  const out: Record<string, any> = {};

  for (const [code, response] of Object.entries(responses)) {
    const schema = resolveRefs(response.schema, definitions, [], 4);
    const properties = schema?.properties ? Object.keys(schema.properties) : undefined;

    out[code] = {
      description: response.description,
      fields: properties,
      note: properties ? 'pass includeResponses:true for the full schema' : undefined,
    };
  }

  return out;
}
