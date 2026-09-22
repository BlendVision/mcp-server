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
 * code. Two ship: `data/api-index.json`, built from the public (BV_EXTERNAL)
 * spec, and `data/api-index-cxm.json`, a reviewed read-only slice of the
 * internal CXM storefront spec. BLENDVISION_API_INDEX replaces both with a
 * comma-separated list of your own.
 */

const METHODS = ['GET', 'PUT', 'POST', 'DELETE', 'PATCH'];

/**
 * call_api refuses mutating calls under this prefix unless writes are enabled.
 *
 * Only CXM is guarded, deliberately. The One API (/bv/) is a published external
 * contract whose own authorization is what callers already rely on, and
 * guarding it here would break existing use. CXM is different on two counts:
 * its operations are not part of that contract, and the platform cannot express
 * "read-only" for it -- cxmPerms is a single undifferentiated group in the RBAC
 * tables, and no read-only role is granted it at all, so a token that can read
 * CXM is also allowed to attempt every CXM write. This is the layer where that
 * distinction can actually be made.
 *
 * The permission is per operation, not a single on/off. "Let the agent create a
 * course" and "let the agent delete every course" are different decisions --
 * one is undoable by hand, the other is not -- and a boolean would collapse
 * them into the same flag.
 */
const GUARDED_PREFIX = '/cxm/';
/**
 * Which CXM writes are permitted, as a comma-separated list of "METHOD path"
 * (`*` for all of them). A boolean would make "let the agent create a course"
 * and "let the agent delete every course" the same decision, which they are
 * not: the operations differ by whether anyone can undo them.
 */
const WRITE_ALLOWLIST_ENV = 'BLENDVISION_CXM_WRITES';
/** The original boolean, still honoured as an alias for `*`. */
const ALLOW_WRITES_ENV = 'BLENDVISION_ALLOW_CXM_WRITES';

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
  // CXM calls a course a "program" and an assigned piece of learning a "task";
  // both are what a person asking the question would call something else.
  course: ['program'],
  courses: ['programs'],
  assignment: ['task'],
  assignments: ['tasks'],
  // A person's own viewing history lives under `my-activities`, and nothing in
  // those paths says "watched". Without this bridge, "my recently watched
  // videos" ranks the org-wide CMS listing (/bv/cms/v1/vods) above the asker's
  // own record -- the wrong question answered with plausible data, which is
  // worse than no match. `my` is a stopword and the path tokenizes on the
  // hyphen, so `activities` is the token that can actually be hit.
  watched: ['activities'],
  viewed: ['activities'],
  history: ['activities'],
};

interface Operation {
  method: string;
  path: string;
  /** The auth_options action the RPC declares, when the index carries it. */
  action?: string;
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
          'Path placeholders may be filled inline (/bv/cms/v1/vods/abc123) or passed as pathParams. ' +
          'Endpoints under /cxm/ are read-only unless the server enables writes; /bv/ is unrestricted.',
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
    const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
    // Two bundled indexes rather than one: the /bv index is compiled from the
    // published external spec, the CXM one from a reviewed slice of the internal
    // spec (scripts/cxm-storefront-reads.txt). Keeping them apart is what makes
    // that slice reviewable -- and lets a deployment drop it by pointing
    // BLENDVISION_API_INDEX at the /bv file alone.
    const files = (fromEnv ? fromEnv.split(',') : [join(dataDir, 'api-index.json'), join(dataDir, 'api-index-cxm.json')])
      .map((f) => f.trim())
      .filter(Boolean);

    try {
      const merged = this.mergeIndexes(files);

      this.index = merged;
      return merged;
    } catch (error) {
      this.indexError =
        `could not load the API index from ${files.join(', ')}` +
        `${fromEnv ? ' (BLENDVISION_API_INDEX)' : ''}: ` +
        `${error instanceof Error ? error.message : String(error)}`;
      throw new Error(this.indexError);
    }
  }

  /**
   * Read and concatenate index files. A bundled file that is absent is skipped
   * -- a build that ships only the /bv index still works -- but a file named
   * explicitly through BLENDVISION_API_INDEX must exist, or the deployment is
   * silently narrower than whoever configured it believes.
   */
  private mergeIndexes(files: string[]): ApiIndex {
    const explicit = !!process.env.BLENDVISION_API_INDEX;
    const operations: Operation[] = [];
    const definitions: Record<string, any> = {};
    const titles: string[] = [];
    let loaded = 0;

    for (const file of files) {
      let raw: string;

      try {
        raw = readFileSync(file, 'utf8');
      } catch (error) {
        if (!explicit && (error as { code?: string }).code === 'ENOENT') continue;
        throw error;
      }

      const parsed = JSON.parse(raw) as ApiIndex;

      if (!Array.isArray(parsed.operations)) {
        throw new Error(`${file}: no operations array`);
      }

      loaded += 1;
      operations.push(...parsed.operations);
      // First definition of a name wins; the shared type names that appear in
      // both specs are the same message either way.
      for (const [name, schema] of Object.entries(parsed.definitions || {})) {
        if (!(name in definitions)) definitions[name] = schema;
      }
      if (parsed.info?.title) titles.push(parsed.info.title);
    }

    if (!loaded) {
      throw new Error('no index file could be read');
    }

    return {
      info: { title: titles.join(' + '), operationCount: operations.length },
      operations,
      definitions,
    };
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
            // Reported on the empty result too: without it a caller cannot tell
            // "the index holds nothing" from "nothing matched this query".
            searched: index.operations.length,
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

      if (path.startsWith(GUARDED_PREFIX) && isMutating(matches[0], method) && !writeIsAllowed(method, matches[0].path)) {
        const action = matches[0]?.action;
        throw new Error(
          `refusing to call ${method} ${path}: it ${action ? `is ${action} and ` : ''}` +
            `changes data under ${GUARDED_PREFIX}. This deployment permits only the writes named in ` +
            `${WRITE_ALLOWLIST_ENV}${process.env[WRITE_ALLOWLIST_ENV] ? ` (${process.env[WRITE_ALLOWLIST_ENV]})` : ' (unset — none)'}. ` +
            'Reads are unaffected, as is the whole /bv/ API.'
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
function writeIsAllowed(method: string, path: string): boolean {
  const legacy = (process.env[ALLOW_WRITES_ENV] || '').trim().toLowerCase();
  if (legacy === '1' || legacy === 'true' || legacy === 'yes') return true;

  const entries = (process.env[WRITE_ALLOWLIST_ENV] || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.includes('*')) return true;

  // Matched on the index's own path template, so the entry is written the way
  // the index spells it -- `/programs/{id}`, not a filled-in id.
  return entries.some((entry) => entry.toUpperCase() === `${method.toUpperCase()} ${path}`.toUpperCase());
}

/**
 * Whether a call changes anything.
 *
 * Decided by the operation's declared action, not its HTTP method: 28 CXM
 * operations are POST with ACTION_READ -- batch-get, report generation,
 * aggregation -- and a method-based rule would refuse all of them while
 * catching nothing extra.
 *
 * With no action recorded (an index built without --actions, or an operation
 * that declares none) it falls back to the method, which errs toward refusing.
 */
function isMutating(op: Operation | undefined, method: string): boolean {
  if (op?.action) {
    return op.action !== 'ACTION_READ';
  }

  return method !== 'GET';
}

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
