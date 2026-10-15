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
// `--cache-key-include-named-cookie` does on Cloud CDN. Use it with
// ABCONVERT_CDN_KEYED_BY_COOKIE=1 in the store to try the cookie-keyed mode.
//
// ORIGIN_REWRITE=force shows what goes wrong when a layer in front of Next.js
// sets `public, s-maxage=60` on every product and collection page, `private`
// included: the CDN then serves one visitor's test price to everyone.
import http from 'node:http';

const PORT = Number(process.env.CDN_PORT || 8080);
const ORIGIN = { host: '127.0.0.1', port: Number(process.env.ORIGIN_PORT || 3000) };
const REWRITE = process.env.ORIGIN_REWRITE || '';
const KEY_COOKIES = (process.env.CDN_KEY_COOKIES || '').split(',').map((name) => name.trim()).filter(Boolean);
const cache = new Map();
const stats = { hits: 0, misses: 0 };

const pathOf = (url) => new URL(url, 'http://cdn').pathname;

/** The path, plus the named cookies' values when CDN_KEY_COOKIES is set. */
function keyOf(req) {
  const path = pathOf(req.url);
  if (!KEY_COOKIES.length) return path;
  const cookies = Object.fromEntries(String(req.headers.cookie ?? '').split(';').map((part) => part.trim().split('=')).filter(([name]) => name).map(([name, ...value]) => [name, value.join('=')]));
  return `${path} ${KEY_COOKIES.map((name) => `${name}=${cookies[name] ?? ''}`).join(' ')}`;
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
    const upstream = http.request({ ...ORIGIN, method: req.method, path: req.url, headers: { ...req.headers, host: req.headers.host ?? `localhost:${PORT}`, 'x-forwarded-for': req.socket.remoteAddress ?? '' } }, (origin) => {
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
  .listen(PORT, '127.0.0.1', () => console.log(`CDN on http://localhost:${PORT} -> origin :${ORIGIN.port}${REWRITE ? ` (ORIGIN_REWRITE=${REWRITE})` : ''}${KEY_COOKIES.length ? `, cache key: path + ${KEY_COOKIES.join(', ')}` : ''}`));
