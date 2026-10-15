// Checks the caching and routing rules the integration depends on, with plain
// HTTP requests (no browser). Run it against the store or against the CDN:
//
//   BASE=http://localhost:8080 TESTED=/products/<handle in a price test> UNTESTED=/products/<handle in none> npm run check
//
// Set ABCONVERT_CDN_KEYED_BY_COOKIE=1, as in the store, to check the cookie-keyed
// mode: a returning visitor's tested page is then cacheable, not private.
//
// TESTED and UNTESTED are optional; the checks that need them are skipped
// without them. The checks follow https://docs.abconvert.io/headless-sdk/nextjs.
const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const TESTED = process.env.TESTED || '';
const UNTESTED = process.env.UNTESTED || '';
const KEYED = process.env.ABCONVERT_CDN_KEYED_BY_COOKIE === '1';
const viaCdn = await fetch(`${BASE}/__cdn/stats`).then((r) => r.ok).catch(() => false);

let failed = 0;
let passed = 0;
let skipped = 0;
const result = (ok, name, detail = '') => {
  if (!ok) failed++;
  else passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const skip = (name, why) => { skipped++; console.log(`SKIP  ${name}  (${why})`); };

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** A page rendered for test groups loads its route under app/[locale]/abconvert/[pageKey]. */
const PAGE_KEY_ROUTE = 'abconvert/%5BpageKey%5D';

/** One page request as a browser makes it: a document load, with the given cookies. */
async function load(path, cookie = '', userAgent = 'Mozilla/5.0 (reference-store check)') {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: { 'sec-fetch-dest': 'document', accept: 'text/html', 'user-agent': userAgent, ...(cookie ? { cookie } : {}) },
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const html = await response.text();
  return { status: response.status, location: response.headers.get('location'), cacheControl: response.headers.get('cache-control') ?? '', setCookies, cdn: response.headers.get('x-cdn-cache-status'), html };
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
  result(/private/.test(first.cacheControl), 'A first visit to a tested page is private (it sets cookies)', first.cacheControl || 'no cache-control');
  // A known crawler gets the original store: no test group and no cookies. The page stays private,
  // so a CDN never stores the crawler's original page and serves it to a shopper in the test.
  const crawler = await load(TESTED, '', GOOGLEBOT);
  result(crawler.status === 200 && !sdkCookies(crawler.setCookies).length, 'A known crawler on a tested page gets no SDK cookies', `${crawler.status} ${sdkCookies(crawler.setCookies).join(', ')}`);
  result(!crawler.html.includes(PAGE_KEY_ROUTE), 'The crawler gets the original store, not a test group\'s page', crawler.html.includes(PAGE_KEY_ROUTE) ? 'rendered under a page key' : 'original route');
  result(/private/.test(crawler.cacheControl), 'It stays private for the crawler, so no CDN keeps its original page', crawler.cacheControl || 'no cache-control');
  const cookie = jar(first.setCookies);
  const second = await load(TESTED, cookie);
  result(!sdkCookies(second.setCookies).length, 'A returning visitor gets no Set-Cookie', sdkCookies(second.setCookies).join(', '));
  if (!KEYED) {
    result(/private/.test(second.cacheControl), 'It stays private for a returning visitor, for a CDN that caches by path', second.cacheControl);
    if (viaCdn) result(first.cdn !== 'HIT' && second.cdn !== 'HIT', 'The CDN never answers a tested page from its cache', `${first.cdn}, ${second.cdn}`);
  } else {
    result(sdkCookies(first.setCookies).includes('abconvert-key'), 'The first visit sets the abconvert-key cookie', sdkCookies(first.setCookies).join(', '));
    result(!/private/.test(second.cacheControl) && /s-maxage/.test(second.cacheControl), 'A returning visitor\'s tested page is cacheable', second.cacheControl || 'no cache-control');
    if (viaCdn) {
      const third = await load(TESTED, cookie);
      result(third.cdn === 'HIT', 'The CDN answers the same test groups from its cache', String(third.cdn));
      const stranger = await load(TESTED);
      result(stranger.cdn !== 'HIT', 'A visitor without the cookie never gets that copy', String(stranger.cdn));
      // A preview or forced link lives in the query string: a key without it answers the link from the stored copy.
      const forced = await load(`${TESTED}${TESTED.includes('?') ? '&' : '?'}abconvert_force=0:0`, cookie);
      result(forced.cdn !== 'HIT', 'A link with an ABConvert query parameter is never answered from the stored copy', `${forced.cdn}: add abconvert_force, abconvert_preview_key and abconvert_experiment_id to the cache key`);
    }
  }
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

console.log(`\n${passed} passed, ${failed} failed, ${skipped} check groups skipped.`);
console.log(skipped ? 'Coverage incomplete: supply the missing inputs above.' : 'Routing/cache checks complete. Checkout and attribution still need the browser walkthrough.');
process.exit(failed ? 1 : 0);
