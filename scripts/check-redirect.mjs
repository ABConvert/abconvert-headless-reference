// HTTP checks for an ACTIVE exact-path redirect test in "every visit" mode.
// Browser navigation, exposure receipt and purchase attribution are separate.
const BASE = new URL(process.env.BASE || 'http://localhost:8080');
const ID = process.env.REDIRECT_TEST_ID;
const SOURCE = process.env.REDIRECT_SOURCE;
const DESTINATION = process.env.REDIRECT_DESTINATION;
if (!ID || !SOURCE || !DESTINATION) {
  console.error('Required: REDIRECT_TEST_ID, REDIRECT_SOURCE and REDIRECT_DESTINATION. See E2E-TESTING.md.');
  process.exit(2);
}
if (!/^\d+$/.test(ID) || !SOURCE.startsWith('/') || SOURCE.startsWith('//') || !DESTINATION.startsWith('/') || DESTINATION.startsWith('//')) {
  console.error('Use a numeric test ID and same-origin paths starting with a single /.');
  process.exit(2);
}
const source = new URL(SOURCE, BASE);
const destination = new URL(DESTINATION, BASE);
let passed = 0;
let failed = 0;
let skipped = 0;
function check(ok, name) {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
function cookiesOf(response, previous = '') {
  const jar = new Map(previous.split('; ').filter(Boolean).map(pair => [pair.split('=')[0], pair]));
  for (const header of response.headers.getSetCookie()) jar.set(header.split('=')[0], header.split(';')[0]);
  return [...jar.values()].join('; ');
}
async function load(url, cookie = '', crawler = false) {
  const response = await fetch(url, {redirect: 'manual', headers: {
    'sec-fetch-dest': 'document', accept: 'text/html',
    'user-agent': crawler ? 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    ...(cookie ? {cookie} : {}),
  }});
  await response.text();
  return response;
}
const forced = index => {
  const url = new URL(source);
  url.searchParams.set('abconvert_force', `${ID}:${index}`);
  url.searchParams.set('utm_source', 'sdk-redirect-check');
  return url;
};
const control = await load(forced(0));
check(control.status === 200, 'Control renders the source');
check(control.headers.get('cache-control')?.includes('private'), 'Control response is private');
const variant = await load(forced(1));
check(variant.status === 307, 'Variant receives a temporary server redirect (307)');
check(variant.headers.get('cache-control')?.includes('private'), 'Variant redirect is private');
check(variant.headers.get('x-cdn-cache-status') !== 'HIT', 'Variant redirect is not a shared CDN hit');
const location = variant.headers.get('location');
if (!location) {
  skipped++;
  console.log('SKIP Destination/repeat checks: no Location header. A newly launched test may still be in the SDK cache; wait for refresh and rerun. The failure above is retained.');
} else {
  const target = new URL(location, BASE);
  const sameOrigin = target.origin === BASE.origin;
  check(sameOrigin && target.pathname === destination.pathname, 'Redirect stays on the headless origin and expected destination');
  check(target.searchParams.get('utm_source') === 'sdk-redirect-check', 'Source campaign parameter survives');
  for (const [key, value] of destination.searchParams) {
    if (!forced(1).searchParams.has(key)) check(target.searchParams.get(key) === value, `Destination parameter ${key} survives`);
  }
  // Never forward the visitor cookie to an unexpected origin.
  if (sameOrigin) {
    let cookie = cookiesOf(variant);
    const landing = await load(target, cookie);
    cookie = cookiesOf(landing, cookie);
    check(landing.status === 200, 'Destination renders without a loop');
    check(landing.headers.get('cache-control')?.includes('private'), 'Destination response is private');
    const repeat = await load(source, cookie);
    const repeatLocation = repeat.headers.get('location');
    check(repeat.status === 307 && !!repeatLocation && new URL(repeatLocation, BASE).pathname === destination.pathname, 'Every-visit mode preserves the Variant assignment');
  }
}
const returningControl = await load(source, cookiesOf(control));
check(returningControl.status === 200 && returningControl.headers.get('x-cdn-cache-status') !== 'HIT', 'Warming Variant does not redirect Control or serve its cached copy');
const crawler = await load(source, '', true);
check(crawler.status === 200 && !crawler.headers.getSetCookie().some(header => header.startsWith('abconvert-')), 'Known crawler stays on source without SDK cookies');
const marker = forced(1);
marker.searchParams.set('_abr', '1');
check((await load(marker)).status === 200, 'Already-redirected marker prevents a loop');
console.log(`\n${passed} passed, ${failed} failed, ${skipped} check groups skipped.`);
console.log('HTTP routing only: complete browser navigation and attribution checks in E2E-TESTING.md.');
process.exitCode = failed ? 1 : 0;
