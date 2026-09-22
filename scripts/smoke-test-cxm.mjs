#!/usr/bin/env node
/**
 * End-to-end check of the api tools against a live BlendVision environment:
 * search_api finds an endpoint, describe_api explains it, call_api fetches real
 * data, and the write guard refuses to mutate.
 *
 * This script NEVER performs a write. It asserts that mutating calls are
 * refused, and it does not exercise BLENDVISION_ALLOW_CXM_WRITES, because doing
 * so would mean actually deleting or reassigning something in whatever
 * environment the token points at. That path is covered by unit-level tests
 * against a stub instead.
 *
 * Usage:
 *   BLENDVISION_API_TOKEN=... BLENDVISION_ORG_ID=... \
 *   BLENDVISION_BASE_URL=https://api.one-dev.blendvision.io \
 *   BLENDVISION_API_INDEX=/path/to/cxm-index.json \
 *   node scripts/smoke-test-cxm.mjs
 *
 * BLENDVISION_API_INDEX is optional: the bundled pair of indexes already covers
 * the reviewed CXM reads. Set it to point at a different slice. If whatever is
 * loaded has no CXM operations at all, the CXM checks are skipped, not failed.
 */

import { BlendVisionClient } from '../build/client.js';
import { ApiTools } from '../build/tools/api_tools.js';

const token = process.env.BLENDVISION_API_TOKEN;
const orgId = process.env.BLENDVISION_ORG_ID;
const baseUrl = process.env.BLENDVISION_BASE_URL;

if (!token || !orgId) {
  console.error('BLENDVISION_API_TOKEN and BLENDVISION_ORG_ID are required');
  process.exit(2);
}

for (const flag of ['BLENDVISION_ALLOW_CXM_WRITES', 'BLENDVISION_CXM_WRITES']) {
  if (process.env[flag]) {
    console.error(`refusing to run with ${flag} set: this script asserts that`);
    console.error('writes are refused, so permitting any would invalidate it');
    process.exit(2);
  }
}

const tools = new ApiTools(new BlendVisionClient({ apiToken: token, organizationId: orgId, baseUrl }));

let failures = 0;
let skipped = 0;

function record(ok, label, detail = '') {
  if (ok === null) {
    skipped += 1;
    console.log(`  SKIP  ${label}${detail && ` — ${detail}`}`);
    return;
  }

  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail && ` — ${detail}`}`);
}

/** Unwraps a tool result into { isError, data }. */
function read(result) {
  const text = result.content[0].text;

  try {
    return { isError: Boolean(result.isError), data: JSON.parse(text) };
  } catch {
    return { isError: Boolean(result.isError), data: { raw: text } };
  }
}

function errorMessage(data) {
  return data?.error?.message || JSON.stringify(data).slice(0, 120);
}

console.log(`index    : ${process.env.BLENDVISION_API_INDEX || '(bundled)'}`);
console.log(`base url : ${baseUrl || '(client default — production)'}`);
console.log(`org      : ${orgId}`);
console.log();

// 1. the index loads and we can see what it covers
console.log('index');
const probe = read(await tools.searchApi({ query: 'list', limit: 1 }));
if (probe.isError) {
  record(false, 'index loads', errorMessage(probe.data));
  process.exit(1);
}
const total = probe.data.searched ?? 0;

// A separate, wider query: searching "cxm" alone also matches One's own
// /bv/analytics/.../cxm/usage, so a single result proves nothing either way.
const cxmProbe = read(await tools.searchApi({ query: 'cxm storefront', limit: 25 }));
const hasCxm = (cxmProbe.data.matches || []).some((m) => m.path.startsWith('/cxm/'));
record(total > 0, 'index loads', `${total} operations`);
record(true, 'cxm coverage', hasCxm ? 'present' : 'absent (cxm checks will be skipped)');
console.log();

// 2. discovery
console.log('discovery');
const search = read(await tools.searchApi({ query: hasCxm ? 'cxm programs' : 'list vods', limit: 3 }));
const top = search.data.matches?.[0];
record(!search.isError && Boolean(top), 'search_api returns a match', top ? `${top.method} ${top.path}` : '');

if (top) {
  const described = read(await tools.describeApi({ path: top.path, method: top.method }));
  const params = described.data.parameters?.length ?? 0;
  record(!described.isError, 'describe_api explains it', `${params} parameters`);
}
console.log();

// 3. a real read
console.log('read');
const readPath = hasCxm ? '/cxm/storefront/v1alpha1/programs' : '/bv/cms/v1/vods';
const got = read(await tools.callApi({ method: 'GET', path: readPath }));

if (got.isError) {
  record(false, `GET ${readPath}`, errorMessage(got.data));
} else {
  const listKey = Object.keys(got.data).find((k) => Array.isArray(got.data[k]));
  const count = listKey ? got.data[listKey].length : 0;
  const totalItems = got.data.pagination?.total_items ?? got.data.page?.total_items ?? '?';
  record(true, `GET ${readPath}`, `${listKey || 'no list'}=${count}, total=${totalItems}`);
}
console.log();

// 4. the guard — asserted, never bypassed
console.log('write guard');
if (!hasCxm) {
  record(null, 'cxm writes refused', 'no cxm operations in this index');
} else {
  // The first is in the index and mutating, so it exercises the guard itself;
  // the other two are not in the index at all, which is the earlier defence.
  for (const [method, path] of [
    ['POST', '/cxm/storefront/v1alpha1/programs'],
    ['POST', '/cxm/storefront/v1alpha1/contents:batch-delete'],
    ['DELETE', '/cxm/storefront/v1alpha1/programs/00000000-0000-0000-0000-000000000000'],
  ]) {
    const attempt = read(await tools.callApi({ method, path, body: {} }));
    const message = errorMessage(attempt.data);
    // Two defences, and either one is enough: an operation absent from the
    // curated index is rejected before the guard is reached, and one that is
    // present (POST /programs) is rejected by the guard because this
    // deployment names no permitted writes.
    const refused =
      attempt.isError && (message.includes('refusing to call') || message.includes('not in the API index'));
    record(refused, `${method} ${path.split('/').pop()} refused`, refused ? message.slice(0, 60) : message);
  }
}

// A CXM read that uses POST must still be allowed, or the guard is too blunt.
if (hasCxm) {
  const postRead = read(await tools.callApi({ method: 'POST', path: '/cxm/storefront/v1alpha1/contents:batch-get', body: {} }));
  const blockedByGuard = postRead.isError && errorMessage(postRead.data).includes('refusing to call');
  record(!blockedByGuard, 'POST read (contents:batch-get) not blocked', blockedByGuard ? 'guard is too blunt' : 'reached the API');
}

console.log();
console.log(failures === 0 ? `OK — ${skipped} skipped` : `${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
