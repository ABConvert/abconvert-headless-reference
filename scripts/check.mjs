// Checks the caching and routing rules the integration depends on, with plain
// HTTP requests (no browser). Run it against the store or against the CDN:
//
//   BASE=http://localhost:8080 TESTED=/products/<handle in a price test> UNTESTED=/products/<handle in none> npm run check
//
// TESTED and UNTESTED are optional; the checks that need them are skipped
// without them. The checks follow https://docs.abconvert.io/headless-sdk/nextjs.
const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const TESTED = process.env.TESTED || '';
const UNTESTED = process.env.UNTESTED || '';
const viaCdn = await fetch(`${BASE}/__cdn/stats`).then((r) => r.ok).catch(() => false);

let failed = 0;
const result = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const skip = (name, why) => console.log(`SKIP  ${name}  (${why})`);

/** One page request as a browser makes it: a document load, with the given cookies. */
async function load(path, cookie = '') {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': 'Mozilla/5.0 (reference-store check)', ...(cookie ? { cookie } : {}) },
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  return { status: response.status, location: response.headers.get('location'), cacheControl: response.headers.get('cache-control') ?? '', setCookies, cdn: response.headers.get('x-cdn-cache-status') };
}
const jar = (setCookies, previous = '') => {
  const all = new Map(previous.split('; ').filter(Boolean).map((pair) => [pair.split('=')[0], pair]));
  for (const header of setCookies) all.set(header.split('=')[0], header.split(';')[0]);
  return [...all.values()].join('; ');
};
const sdkCookies = (setCookies) => setCookies.map((header) => header.split('=')[0]).filter((name) => name.startsWith('abconvert-'));

console.log(`Checking ${BASE}${viaCdn ? ' through the CDN stand-in' : ''}\n`);

// Routing that holds whatever the tests.
{
  const direct = await load('/abconvert/-/products/anything');
  result(direct.status === 308 && direct.location?.endsWith('/products/anything'), 'A direct visit to /abconvert/... redirects to the clean URL', `${direct.status} ${direct.location ?? ''}`);
  const locale = await load('/en/products/anything');
  result(locale.status === 302 && locale.location?.endsWith('/products/anything'), 'A visit to /en/... redirects to the clean URL (the locale is internal)', `${locale.status} ${locale.location ?? ''}`);
}

if (TESTED) {
  const first = await load(TESTED);
  const names = sdkCookies(first.setCookies);
  result(names.includes('abconvert-visitor'), 'A new visitor on a tested page gets the SDK cookies', names.join(', ') || 'none: is a test running, or is the page in no test?');
  result(/private/.test(first.cacheControl), 'A tested page is private for a CDN that caches by path', first.cacheControl || 'no cache-control');
  const second = await load(TESTED, jar(first.setCookies));
  result(/private/.test(second.cacheControl), 'It stays private for a returning visitor', second.cacheControl);
  result(!sdkCookies(second.setCookies).length, 'A returning visitor gets no Set-Cookie', sdkCookies(second.setCookies).join(', '));
  if (viaCdn) result(first.cdn !== 'HIT' && second.cdn !== 'HIT', 'The CDN never answers a tested page from its cache', `${first.cdn}, ${second.cdn}`);
} else {
  skip('Tested page checks', 'set TESTED to a product page a running price test covers');
}

if (UNTESTED) {
  const first = await load(UNTESTED);
  const second = await load(UNTESTED, jar(first.setCookies));
  result(!/private/.test(second.cacheControl) && /s-maxage/.test(second.cacheControl), 'A page no test changes stays cacheable', second.cacheControl || 'no cache-control');
  result(!second.setCookies.length, 'It carries no Set-Cookie for a returning visitor', second.setCookies.map((header) => header.split('=')[0]).join(', '));
  if (viaCdn) {
    const third = await load(UNTESTED, jar(first.setCookies));
    result(third.cdn === 'HIT', 'The CDN answers it from its cache', String(third.cdn));
  }
} else {
  skip('Untested page checks', 'set UNTESTED to a product page no test covers');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
