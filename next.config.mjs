// Product and collection pages answer `public, s-maxage=60`, so a CDN such as
// Google Cloud CDN keeps them for a minute. On a page a test can change,
// the ABConvert middleware sets `private`, and the middleware's value wins
// over this rule: that page goes past the CDN to Next.js, which still serves
// its own cached copy for the visitor's test groups.
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return ['/products/:path*', '/collections/:path*'].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'public, s-maxage=60' }],
    }));
  },
};
