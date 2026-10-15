// A local stand-in for Google Cloud CDN in front of the store, configured the
// way a typical production setup behaves:
//
// - The cache key is the path only. The query string and cookies are not part
//   of it, so every visitor of /products/x gets the same stored copy. (Cloud
//   CDN's default key includes the query string; many setups exclude it.)
// - It keeps a response for its `s-maxage` (else `max-age`), as Cloud CDN does,
//   and never serves from cache one that sets a cookie or says `private`,
//   `no-store` or `no-cache`.
// - A request with an `RSC` header (a client-side navigation in Next.js)
//   always goes to the origin.
// - `Vary` is not part of the key. Cloud CDN does not cache a response whose
//   `Vary` names a header outside its allowed list, such as the `RSC` that
//   Next.js adds, so a production setup rewrites `Vary` to `Accept-Encoding`
//   in front of Next.js. The stand-in assumes that rewrite.
//
// Run the store (`npm run build && npm run start`), then `npm run cdn` and
// browse http://localhost:8080. Each response carries `x-cdn-cache-status:
// HIT` or `MISS`. GET /__cdn/stats lists the stored paths, GET /__cdn/purge
// empties the cache.
//
// CDN_KEY_COOKIES=abconvert-key adds that cookie's value to the cache key, as
// `--cache-key-include-named-cookie` does on Cloud CDN, and
// CDN_KEY_QUERY=abconvert_force,abconvert_preview_key,abconvert_experiment_id
// adds those query parameters, as a query string whitelist does. Use both with
// ABCONVERT_CDN_KEYED_BY_COOKIE=1 in the store to try the cookie-keyed mode.
//
// CDN_COUNTRY=US adds `x-country: US` to every request it forwards, as a Google
// Cloud load balancer's custom request header `x-country:{client_region}`
// does. The SDK reads it for tests that target visitors by country. Restart
// with another code to be a visitor from another country.
//
// ORIGIN_REWRITE=force shows what goes wrong when a layer in front of Next.js
// sets `public, s-maxage=60` on every product and collection page, `private`
// included: the CDN then serves one visitor's test price to everyone.
import http from 'node:http';

const PORT = Number(process.env.CDN_PORT || 8080);
const ORIGIN = { host: '127.0.0.1', port: Number(process.env.ORIGIN_PORT || 3000) };
const REWRITE = process.env.ORIGIN_REWRITE || '';
const COUNTRY = (process.env.CDN_COUNTRY || '').toUpperCase();
const KEY_COOKIES = (process.env.CDN_KEY_COOKIES || '').split(',').map((name) => name.trim()).filter(Boolean);
// Query parameters that are part of the key, like Cloud CDN's query string
// whitelist. ABConvert's preview and force links live in the query string, so
// a key without them answers such a link from the copy stored for the
// visitor's current test groups, and the link does nothing for up to s-maxage.
const KEY_QUERY = (process.env.CDN_KEY_QUERY || '').split(',').map((name) => name.trim()).filter(Boolean);
const cache = new Map();
const stats = { hits: 0, misses: 0 };

const pathOf = (url) => new URL(url, 'http://cdn').pathname;

/** The path, plus the named cookies' values when CDN_KEY_COOKIES is set. */
function keyOf(req) {
  const url = new URL(req.url, 'http://cdn');
  const parts = [url.pathname];
  for (const name of KEY_QUERY) if (url.searchParams.has(name)) parts.push(`?${name}=${url.searchParams.get(name)}`);
  if (KEY_COOKIES.length) {
    const cookies = Object.fromEntries(String(req.headers.cookie ?? '').split(';').map((part) => part.trim().split('=')).filter(([name]) => name).map(([name, ...value]) => [name, value.join('=')]));
    for (const name of KEY_COOKIES) parts.push(`${name}=${cookies[name] ?? ''}`);
  }
  return parts.join(' ');
}

function rewrite(path, headers) {
  if (REWRITE === 'force' && /^\/(products|collections)\//.test(path)) headers['cache-control'] = 'public, s-maxage=60';
}

/** Seconds the CDN may keep this response, 0 for never. */
function ttlOf(status, headers) {
  if (status !== 200 && status !== 308) return 0;
  if (headers['set-cookie']) return 0;
  const cc = String(headers['cache-control'] ?? '');
  if (/private|no-store|no-cache/i.test(cc)) return 0;
  const seconds = /s-maxage=(\d+)/.exec(cc)?.[1] ?? /max-age=(\d+)/.exec(cc)?.[1];
  return seconds ? Number(seconds) : 0;
}

http
  .createServer((req, res) => {
    if (req.url === '/__cdn/stats') return res.end(JSON.stringify({ ...stats, stored: [...cache.keys()] }, null, 2));
    if (req.url === '/__cdn/purge') { cache.clear(); return res.end('{}'); }

    const key = keyOf(req);
    const cacheable = (req.method === 'GET' || req.method === 'HEAD') && !req.headers.rsc;
    const entry = cacheable ? cache.get(key) : undefined;
    if (entry && Date.now() < entry.expires) {
      stats.hits++;
      res.writeHead(entry.status, { ...entry.headers, 'x-cdn-cache-status': 'HIT', age: String(Math.floor((Date.now() - entry.stored) / 1000)) });
      return res.end(entry.body);
    }
    if (entry) cache.delete(key);

    stats.misses++;
    const upstream = http.request({ ...ORIGIN, method: req.method, path: req.url, headers: { ...req.headers, host: req.headers.host ?? `localhost:${PORT}`, 'x-forwarded-for': req.socket.remoteAddress ?? '', ...(COUNTRY ? { 'x-country': COUNTRY } : {}) } }, (origin) => {
      const chunks = [];
      origin.on('data', (chunk) => chunks.push(chunk));
      origin.on('end', () => {
        const body = Buffer.concat(chunks);
        const headers = { ...origin.headers };
        delete headers['transfer-encoding'];
        delete headers.connection;
        rewrite(pathOf(req.url), headers);
        const ttl = cacheable ? ttlOf(origin.statusCode, headers) : 0;
        if (ttl) cache.set(key, { status: origin.statusCode, headers, body, stored: Date.now(), expires: Date.now() + ttl * 1000 });
        res.writeHead(origin.statusCode ?? 502, { ...headers, 'x-cdn-cache-status': 'MISS' });
        res.end(body);
      });
    });
    upstream.on('error', (error) => { res.writeHead(502); res.end(String(error)); });
    req.pipe(upstream);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`CDN on http://localhost:${PORT} -> origin :${ORIGIN.port}${REWRITE ? ` (ORIGIN_REWRITE=${REWRITE})` : ''}${COUNTRY ? `, x-country: ${COUNTRY}` : ''}${KEY_COOKIES.length || KEY_QUERY.length ? `, cache key: path${KEY_QUERY.length ? ` + ?${KEY_QUERY.join(', ?')}` : ''}${KEY_COOKIES.length ? ` + ${KEY_COOKIES.join(', ')}` : ''}` : ''}`));
