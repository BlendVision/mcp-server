#!/usr/bin/env node
/**
 * Exercises the resource-server behaviour end to end against a throwaway
 * authorization server, so the claims in src/oauth.ts are checkable without a
 * real one existing.
 *
 * It stands up an authorization server that publishes metadata and a JWKS,
 * mints tokens against it, starts the connector pointed at it, and asserts what
 * each request gets back: the metadata document, the challenge on a missing
 * token, the rejection of a token minted for somebody else, and the step-up
 * challenge when a CXM write is attempted with only the read scope.
 *
 *   node scripts/smoke-test-oauth.mjs
 *
 * Requires a build: npm run build.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const AS_PORT = 4411;
const MCP_PORT = 4412;
const ISSUER = `http://127.0.0.1:${AS_PORT}`;
const RESOURCE = `http://127.0.0.1:${MCP_PORT}/mcp`;

let failures = 0;

function check(name, condition, detail) {
  const mark = condition ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${name}`);
  if (!condition) {
    failures += 1;
    if (detail !== undefined) console.log(`       ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
}

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

const authorizationServer = createServer((req, res) => {
  const send = (body) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.url === '/.well-known/oauth-authorization-server') {
    return send({ issuer: ISSUER, jwks_uri: `${ISSUER}/keys` });
  }
  if (req.url === '/keys') {
    return send({ keys: [jwk] });
  }

  res.writeHead(404).end();
});

await new Promise((resolve) => authorizationServer.listen(AS_PORT, '127.0.0.1', resolve));

const mint = ({ scope, audience = RESOURCE, subject = 'user-1' }) =>
  new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

const connector = spawn('node', ['build/connector.js'], {
  env: {
    ...process.env,
    PORT: String(MCP_PORT),
    BLENDVISION_OAUTH_ISSUER: ISSUER,
    BLENDVISION_OAUTH_RESOURCE: RESOURCE,
    BLENDVISION_CXM_WRITES: 'POST /cxm/storefront/v1alpha1/programs',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});

const connectorLog = [];
connector.stderr.on('data', (chunk) => connectorLog.push(chunk.toString()));

const ready = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${MCP_PORT}/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

if (!(await ready())) {
  console.error('connector did not start:\n' + connectorLog.join(''));
  connector.kill();
  authorizationServer.close();
  process.exit(1);
}

const rpc = (body, token) =>
  fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } },
};

const callApi = (method, path) => ({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: { name: 'call_api', arguments: { method, path } },
});

try {
  // --- discovery -----------------------------------------------------------
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    const response = await fetch(`http://127.0.0.1:${MCP_PORT}${path}`);
    const body = await response.json();

    check(`${path} is served`, response.status === 200, response.status);
    check(`${path} names the authorization server`, body.authorization_servers?.[0] === ISSUER, body);
    check(`${path} claims the right resource`, body.resource === RESOURCE, body);
    check(`${path} accepts the header only`, JSON.stringify(body.bearer_methods_supported) === '["header"]', body);
  }

  // --- the challenge -------------------------------------------------------
  {
    const response = await rpc(initialize);
    const challenge = response.headers.get('www-authenticate') || '';

    check('no token is 401', response.status === 401, response.status);
    check(
      'no token carries resource_metadata',
      challenge.includes(`resource_metadata="http://127.0.0.1:${MCP_PORT}/.well-known/oauth-protected-resource/mcp"`),
      challenge
    );
  }

  // --- token validation ----------------------------------------------------
  {
    const response = await rpc(initialize, 'not-a-jwt');
    check('a malformed token is 401', response.status === 401, response.status);
    check('a malformed token says invalid_token', (response.headers.get('www-authenticate') || '').includes('error="invalid_token"'));
  }

  {
    const foreign = await mint({ scope: 'mcp.read', audience: 'https://someone-else.example/mcp' });
    const response = await rpc(initialize, foreign);
    check('a token minted for another audience is refused', response.status === 401, response.status);
  }

  // --- scopes --------------------------------------------------------------
  {
    const readOnly = await mint({ scope: 'mcp.read' });

    const reading = await rpc(callApi('GET', '/cxm/storefront/v1alpha1/programs'), readOnly);
    check('a CXM read needs only mcp.read', reading.status !== 403, reading.status);

    const writing = await rpc(callApi('POST', '/cxm/storefront/v1alpha1/programs'), readOnly);
    const challenge = writing.headers.get('www-authenticate') || '';

    check('a CXM write without the scope is 403', writing.status === 403, writing.status);
    check('the 403 says insufficient_scope', challenge.includes('error="insufficient_scope"'), challenge);
    check('the 403 names the scope to step up to', challenge.includes('scope="mcp.cxm.write"'), challenge);
  }

  {
    const full = await mint({ scope: 'mcp.read mcp.cxm.write' });
    const writing = await rpc(callApi('POST', '/cxm/storefront/v1alpha1/programs'), full);

    check('a CXM write with the scope passes the scope check', writing.status !== 403, writing.status);
  }

  // --- the gap this phase leaves open --------------------------------------
  {
    const valid = await mint({ scope: 'mcp.read' });
    const response = await rpc(initialize, valid);
    const body = await response.json();

    check('a valid token stops at the missing token exchange', response.status === 501, response.status);
    check('and says why', /exchange/i.test(body.error?.message || ''), body);
  }

  // --- the URL forms are gone ----------------------------------------------
  for (const url of [`http://127.0.0.1:${MCP_PORT}/mcp/sometoken`, `http://127.0.0.1:${MCP_PORT}/mcp?token=sometoken`]) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(initialize),
    });
    const body = await response.json();

    check(`${url.replace(`http://127.0.0.1:${MCP_PORT}`, '')} does not authenticate`, response.status === 401, response.status);
    check('and says to use the header', /Authorization: Bearer/.test(body.error?.message || ''), body);
  }
} finally {
  connector.kill();
  authorizationServer.close();
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
