import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';

/**
 * OAuth 2.1 resource-server concerns, kept apart from the transport so the
 * rules are readable in one place and testable without an HTTP server.
 *
 * This server is a *resource server* and nothing else: it validates tokens that
 * an authorization server minted for it, and never mints one. Which
 * authorization server is a deployment decision, named by
 * BLENDVISION_OAUTH_ISSUER. With that unset the whole module is inert and the
 * connector keeps accepting a BlendVision API token in the Authorization
 * header, which is how every current deployment works.
 *
 * OAuth mode does not replace the BlendVision credential; it sits beside it,
 * permanently. agent-server -- the CXM AiSK path -- calls this server with the
 * user's own orbit token, and CXM is not moving to OAuth. So a token is routed
 * by who issued it: one from the configured issuer is an OAuth token and is
 * verified in full here; anything else is a BlendVision token and goes to the
 * API exactly as it always has, where the API verifies it. See isOAuthToken.
 *
 * What is deliberately NOT here: obtaining a BlendVision API credential for the
 * verified user. A token minted for this server must not be replayed against
 * api.one.blendvision.com -- that is the confused-deputy case RFC 9728 exists
 * to prevent -- so acting on the user's behalf needs an RFC 8693 exchange at
 * the authorization server. Until that exists, OAuth mode authenticates and
 * authorizes but cannot call anything, and says so.
 */

/** Read access to everything the bundled API index exposes. */
export const READ_SCOPE = 'mcp.read';

/**
 * Permission to perform the CXM writes *this deployment* permits.
 *
 * One scope rather than one per operation, which is a narrower claim than it
 * may look. BLENDVISION_CXM_WRITES already decides which individual writes the
 * deployment will attempt at all, per operation, and it keeps doing that: this
 * scope sits above it and answers a different question -- whether this person
 * delegated write capability to this client in the first place. Splitting it
 * per operation would mean naming a scope for every path in the index, which
 * the index cannot do for us and which no authorization server can usefully
 * present on a consent screen. If finer grants are wanted later they belong in
 * the authorization server's model, and this constant becomes a prefix.
 */
export const CXM_WRITE_SCOPE = 'mcp.cxm.write';

const DEFAULT_SCOPES = [READ_SCOPE, CXM_WRITE_SCOPE];

const ISSUER_ENV = 'BLENDVISION_OAUTH_ISSUER';
const RESOURCE_ENV = 'BLENDVISION_OAUTH_RESOURCE';
const SCOPES_ENV = 'BLENDVISION_OAUTH_SCOPES';

export interface OAuthConfig {
  /** The authorization server's issuer identifier. */
  issuer: string;
  /**
   * This server's canonical URI, the `aud` every accepted token must carry.
   * Left unset it is derived per request from the forwarded host, which is
   * what a deployment behind a load balancer wants.
   */
  resource?: string;
  scopesSupported: string[];
}

/**
 * The deployment's OAuth configuration, or undefined when it has none.
 *
 * Presence of the issuer is the switch. Nothing else turns OAuth mode on, so a
 * deployment cannot half-enable it by setting a scope list and wondering why
 * tokens are still unchecked.
 */
export function oauthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OAuthConfig | undefined {
  const issuer = (env[ISSUER_ENV] || '').trim();
  if (!issuer) return undefined;

  const scopes = (env[SCOPES_ENV] || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    issuer: issuer.replace(/\/+$/, ''),
    resource: (env[RESOURCE_ENV] || '').trim() || undefined,
    scopesSupported: scopes.length ? scopes : DEFAULT_SCOPES,
  };
}

/**
 * The canonical URI clients must name in their `resource` parameter.
 *
 * RFC 8707 wants the most specific URI identifying this server, and the MCP
 * endpoint is at /mcp, so that is what we claim -- no trailing slash, which
 * the spec asks for consistently.
 */
export function canonicalResource(config: OAuthConfig, forwarded: { proto: string; host: string }): string {
  if (config.resource) return config.resource.replace(/\/+$/, '');
  return `${forwarded.proto}://${forwarded.host}/mcp`;
}

/** Where this server publishes its RFC 9728 metadata, for the challenge header. */
export function metadataUrl(resource: string): string {
  const url = new URL(resource);
  const path = url.pathname.replace(/\/+$/, '');
  // RFC 9728 §3.1: the path component of the resource is appended to the
  // well-known path, so a resource at /mcp publishes at
  // /.well-known/oauth-protected-resource/mcp.
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
}

/** The RFC 9728 protected-resource metadata document. */
export function protectedResourceMetadata(config: OAuthConfig, resource: string) {
  return {
    resource,
    authorization_servers: [config.issuer],
    scopes_supported: config.scopesSupported,
    // Only the header. Tokens in a query string are forbidden by the MCP
    // authorization spec, and this server no longer reads them from a path
    // segment either.
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://github.com/BlendVision/mcp-server',
  };
}

/**
 * A `WWW-Authenticate: Bearer …` value.
 *
 * `resource_metadata` is the part that matters: it is the only thing that
 * tells a client an authorization server exists at all.
 */
export function challengeHeader(params: {
  resourceMetadata: string;
  scope?: string;
  error?: string;
  errorDescription?: string;
}): string {
  const quoted = (k: string, v: string) => `${k}="${v.replace(/"/g, '\\"')}"`;
  const parts = [quoted('resource_metadata', params.resourceMetadata)];

  if (params.error) parts.unshift(quoted('error', params.error));
  if (params.errorDescription) parts.push(quoted('error_description', params.errorDescription));
  if (params.scope) parts.push(quoted('scope', params.scope));

  return `Bearer ${parts.join(', ')}`;
}

/** The granted scopes, from either spelling an authorization server may use. */
export function scopesOf(claims: JWTPayload): Set<string> {
  const raw = claims.scope ?? (claims as Record<string, unknown>).scp;

  if (typeof raw === 'string') return new Set(raw.split(/\s+/).filter(Boolean));
  if (Array.isArray(raw)) return new Set(raw.map(String).filter(Boolean));

  return new Set();
}

/**
 * JWKS discovery, cached for the life of the process.
 *
 * The authorization server's metadata is asked first, because `jwks_uri` is
 * where it is allowed to move the keys to. The fallback is the conventional
 * path, which is also where orbit's own Cognito verification looks, so a
 * deployment whose authorization server publishes no metadata still works.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function jwksFor(issuer: string): Promise<ReturnType<typeof createRemoteJWKSet>> {
  const cached = jwksCache.get(issuer);
  if (cached) return cached;

  let jwksUri = `${issuer}/.well-known/jwks.json`;

  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
    try {
      const response = await fetch(`${issuer}${path}`, { headers: { accept: 'application/json' } });
      if (!response.ok) continue;

      const metadata = (await response.json()) as { jwks_uri?: string };
      if (metadata.jwks_uri) {
        jwksUri = metadata.jwks_uri;
        break;
      }
    } catch {
      // Discovery is best effort; the conventional path is the fallback.
    }
  }

  const set = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(issuer, set);

  return set;
}

export type VerifyResult =
  | { ok: true; claims: JWTPayload; scopes: Set<string> }
  | { ok: false; reason: string };

/**
 * Verify an access token against the configured authorization server.
 *
 * The audience check is the point of the exercise. A token minted for some
 * other service, by the same authorization server, must not work here -- that
 * is what stops this server being used as a confused deputy for a credential
 * the caller obtained elsewhere.
 */
export async function verifyAccessToken(
  token: string,
  config: OAuthConfig,
  resource: string
): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, await jwksFor(config.issuer), {
      issuer: config.issuer,
      audience: resource,
    });

    return { ok: true, claims: payload, scopes: scopesOf(payload) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Whether a bearer token claims to come from the configured authorization
 * server, and so must be verified here as an OAuth access token.
 *
 * Decided from the unverified `iss`, which is safe because it only chooses the
 * stricter path: a token that names our issuer is held to full verification
 * with no fallback, so forging the claim gains nothing. A token that names
 * anyone else -- orbit's own login and API tokens carry `iss: "orbit"` -- is a
 * BlendVision credential and is left for the BlendVision API to verify, as it
 * is with OAuth mode off. An opaque or malformed token is treated the same way;
 * the API is the authority on it, not this server.
 */
export function isOAuthToken(token: string, config: OAuthConfig): boolean {
  try {
    return decodeJwt(token).iss === config.issuer;
  } catch {
    return false;
  }
}
