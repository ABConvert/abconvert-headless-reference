# ABConvert headless reference store

A Next.js storefront that runs ABConvert tests with `@abconvert/headless`, set up the way a Next.js 14 App Router store behind Google Cloud CDN is: page caching, a locale rewrite in its own middleware, Storefront API carts through server actions, and checkout on Shopify.

Use it to see a working integration, to copy from, and to check your own store against. Read [INTEGRATION-NOTES.md](./INTEGRATION-NOTES.md) before you integrate: one short rule per thing that matters, from caching to checkout.

| Your stack | In this store |
|---|---|
| Next.js 14.2 App Router, React 18 | `next@14.2.35`, `react@18.3.1` |
| Pages cached with ISR | Product and collection pages `revalidate = 60`; home, cart and search render per request |
| A locale segment the visitor never sees | `middleware.ts` rewrites `/products/x` to `app/[locale]/products/x` and redirects `/en/...` to the clean URL |
| `Cache-Control: public, s-maxage=60` on product and collection pages | A `headers()` rule in `next.config.mjs` |
| Google Cloud CDN, cache key on the path | `scripts/cdn.mjs`, a local stand-in that behaves the same way |
| Storefront API through the Headless channel | `lib/shopify.ts`, with the private token on the server |
| Add to Cart, Buy Now, Buy with Shop Pay | Server actions and a cart permalink |
| A cart drawer with recommendations | `components/CartDrawer.tsx`, priced on the server |
| Prices by country | A country selector; `@inContext(country:)` and the cart's `buyerIdentity.countryCode` |

## Quick start

You need Node.js 18.18 or later.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With nothing configured, the store reads `hardware.mock.shop`, Shopify's public sample catalog: pages and carts work, but no test runs, because ABConvert is not installed on that store. Open the **ABConvert** panel at the bottom right to see what the SDK knows on each page.

## Run it end to end on a dev store

This is the real check: a test price on your storefront, the same price in Shopify checkout, and the order counted in the test.

### 1. Connect the store through the Headless channel

1. In the Shopify admin, install the [Headless channel](https://apps.shopify.com/headless) and click **Create storefront**. Shopify's guide: [Getting started with the Storefront API](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/getting-started).
2. Open the storefront (**Sales channels**, **Headless**, your storefront). In **Storefront API tokens**, copy the private access token, and the public one as a fallback.
3. In **Storefront API permissions**, keep read access to product listings and write access to checkouts, which the cart needs. Shopify lists `unauthenticated_read_product_listings` and `unauthenticated_write_checkouts` for [international pricing](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/markets/international-pricing).

Every Storefront API call in this store runs on the server, so it sends the private token in `Shopify-Storefront-Private-Token` and the shopper's IP in `Shopify-Storefront-Buyer-IP` on the requests a shopper causes, as [Shopify asks](https://shopify.dev/docs/api/storefront#authentication). Without the buyer IP, Shopify may throttle those requests or treat them as a bot. Never send the private token to the browser.

### 2. Connect ABConvert

1. Install ABConvert on the same store, and ask your ABConvert contact to turn on the headless SDK for it.
2. In ABConvert, open **Settings**, **Headless Storefront**, click **Create Storefront Key**, and copy the key. The key is public: it identifies your store's tests, and you can revoke it at any time.

### 3. Configure and run

```bash
cp .env.example .env.local
```

Fill in:

```bash
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=your-private-access-token
ABCONVERT_SHOP=your-store.myshopify.com
ABCONVERT_STOREFRONT_KEY=your-storefront-key
SITE_URL=http://localhost:3000
```

Then build and start. Caching only happens in a production build: `npm run dev` renders every request.

```bash
npm run build && npm run start
```

In a second terminal, put the CDN stand-in in front and browse http://localhost:8080 instead:

```bash
npm run cdn
```

### 4. Create a test and check it

1. In ABConvert, create a price test on one of your products and leave it in **Preview**.
2. Copy its preview link, replace the domain with `http://localhost:8080`, and add `&abconvert_force=<test ID>:1`. The product page shows Variant A's price. The panel shows the page key and the forced test group.
3. Open a collection with that product, the cart drawer and the cart page. All show the same price.
4. Go to checkout four ways: **Checkout** in the cart drawer, **Checkout** on the cart page, **Buy Now**, and **Buy with Shop Pay**. Each checkout line shows Variant A's price.
5. Change the force to `:0`. Every page and checkout show Control's price.
6. Launch the test. Wait a minute, open a private window without the preview link, and browse as a new visitor. The browser sends the assignment, the exposure, page views and add to cart to ABConvert; a completed order shows in the test's results.

The full walk-through is in [Preview and check your integration](https://docs.abconvert.io/headless-sdk/preview).

## How it works

```
Browser ─▶ Google Cloud CDN ─▶ Next.js middleware ─▶ page route ─▶ Next.js cache
           (key: the path)     planMiddleware()       /en/products/x            one copy
                               decides test groups    or                        per path
                               sets cookies once      /en/abconvert/<key>/products/x
                               marks tested pages     (rendered from the key,
                               private                 nothing about the visitor)
```

1. **The middleware decides.** `planMiddleware` reads or creates the visitor, places them in each test, writes the SDK's cookies only when they change, and redirects for a URL redirect test.
2. **A tested page is rewritten to a page key.** When a test changes the page for this visitor, the request goes to `app/[locale]/abconvert/[pageKey]/...`. The page key names the test groups and nothing about the visitor, so Next.js caches one copy per test group combination, and everyone in those test groups shares it. Pages no test changes are not rewritten and are cached once, as without ABConvert.
3. **A path-keyed CDN never stores a tested page.** The middleware sets `cache-control: private` on every page a test can change, for every visitor. The CDN passes those pages to Next.js, which still answers from its own cache. Untested pages keep `public, s-maxage=60` and are served by the CDN.
4. **The browser tracks.** The provider in each layout reads the visitor from the cookies and sends assignments, exposures and events.
5. **The cart carries the test groups to checkout.** The cart actions write ABConvert's cart and line attributes. ABConvert's Shopify Functions read them in checkout and charge the test price; the web pixel and the order carry the same visitor.

## Where ABConvert plugs in

| File | What it does | Docs |
|---|---|---|
| `lib/abconvert.ts` | The SDK options, shared by everything below | [Next.js, step 2](https://docs.abconvert.io/headless-sdk/nextjs#step-2-add-the-middleware) |
| `middleware.ts` | `planMiddleware`, merged with the store's own locale rewrite | [Next.js, step 2](https://docs.abconvert.io/headless-sdk/nextjs#step-2-add-the-middleware) |
| `app/[locale]/abconvert/[pageKey]/` | The page key routes: the same pages, rendered from the key | [Next.js, step 3](https://docs.abconvert.io/headless-sdk/nextjs#step-3-add-the-page-key-routes) |
| `app/[locale]/*/layout.tsx` | `ABConvertProvider` with the page's state | [Next.js, step 3](https://docs.abconvert.io/headless-sdk/nextjs#step-3-add-the-page-key-routes) |
| `components/ProductView.tsx` | Canonical URLs built from the route params | [Next.js, step 4](https://docs.abconvert.io/headless-sdk/nextjs#step-4-build-canonical-urls-from-the-route) |
| `components/Price.tsx` | The test price, else the Storefront API price, and the exposure | [Prices](https://docs.abconvert.io/headless-sdk/prices) |
| `lib/cart.ts`, `app/actions.ts` | Cart and line attributes on every cart change, checked again before checkout | [Cart](https://docs.abconvert.io/headless-sdk/cart) |
| `lib/drawer.ts`, `components/CartDrawer.tsx` | The cart drawer, priced on the server | [Cart](https://docs.abconvert.io/headless-sdk/cart) |
| `components/Tracking.tsx`, `ProductViewed.tsx`, `AddToCart.tsx` | Page views, product views and add to cart | [Tracking](https://docs.abconvert.io/headless-sdk/tracking) |
| `components/ShopPayLink.tsx` | A cart permalink with the visitor's test groups | [Cart](https://docs.abconvert.io/headless-sdk/cart) |
| `components/DebugPanel.tsx` | The panel: visitor, page key, test groups, forcing | [Preview](https://docs.abconvert.io/headless-sdk/preview) |

## Caching rules to keep

- **Keep `private` on every response that has it.** The middleware's `Cache-Control` wins over a `headers()` rule in `next.config.mjs`, as in this store. A proxy or load balancer that rewrites `Cache-Control` in front of Next.js must leave `private` alone. If it sets `public` on every product page, the CDN serves one visitor's test price to everyone. Try it: `ORIGIN_REWRITE=force npm run cdn`.
- **Cloud CDN does not cache a response whose `Vary` names headers outside its allowed list**, such as the `RSC` that Next.js adds. A storefront whose product pages answer `Vary: Accept-Encoding` already rewrites it. Keep doing so for pages without `private`.
- **Client-side navigations bypass the CDN.** Next.js fetches them with an `RSC` header, and Next.js answers them from its own cache.
- **Optional: cache tested pages at the CDN too.** By default a tested page goes past the CDN, and Next.js serves it from its own cache. Two settings let the CDN store tested pages too, one copy per combination of test groups. The order matters:

  1. Add the `abconvert-key` cookie and ABConvert's three query parameters to the CDN's cache key. On Google Cloud CDN:

     ```bash
     gcloud compute backend-services update YOUR_BACKEND_SERVICE --global \
       --cache-key-include-named-cookie=abconvert-key \
       --cache-key-include-query-string \
       --cache-key-query-string-whitelist=abconvert_force,abconvert_preview_key,abconvert_experiment_id
     ```

     The query parameters matter as much as the cookie. A preview link and a forced test group live in the query string; a key without them answers such a link from the copy stored for the visitor's current test groups, so the link does nothing for up to 60 seconds.

  2. Then set `ABCONVERT_CDN_KEYED_BY_COOKIE=1` and rebuild. It turns on the SDK's `cdnKeyedByCookie` in `lib/abconvert.ts`.

  To turn it off, go in reverse: unset `ABCONVERT_CDN_KEYED_BY_COOKIE` first, then remove the cookie from the cache key. Never run the store with the setting on while the CDN keys on the path alone: the CDN would store one test group's page and serve it, with its prices, to every visitor.

  The cookie holds the visitor's test groups and no visitor or session ID. A first visit sets cookies, so it is never cached; from the second request on, the CDN can answer. The cache key applies to every page behind the backend service, so route product, collection and search paths through their own backend service to keep other pages stored once.

  Try it locally:

  ```bash
  ABCONVERT_CDN_KEYED_BY_COOKIE=1 npm run build && ABCONVERT_CDN_KEYED_BY_COOKIE=1 npm run start
  CDN_KEY_COOKIES=abconvert-key CDN_KEY_QUERY=abconvert_force,abconvert_preview_key,abconvert_experiment_id npm run cdn
  ABCONVERT_CDN_KEYED_BY_COOKIE=1 BASE=http://localhost:8080 TESTED=/products/your-tested-product npm run check
  ```

  See Google's [cache key settings](https://docs.cloud.google.com/cdn/docs/using-cache-keys) and [caching rules](https://docs.cloud.google.com/cdn/docs/caching).

## After you launch, edit or end a test

For up to about two minutes, a page can still show the old price: up to 60 seconds for the SDK's copy of your tests on each server, plus up to 60 seconds at the CDN for a page it stored before the change. Next.js adds no delay, because a change gives tested pages a new page key. The cart and the drawer show Shopify's cart cost, which is what checkout charges, so the shopper sees the right price before paying.

To shorten it: launch and end tests when traffic is low, and clear the CDN's cache for product, collection and search pages right after the change:

```bash
gcloud compute url-maps invalidate-cdn-cache YOUR_URL_MAP --path "/products/*"
```

## Cart drawer

The drawer opens from the header and after Add to Cart, on any page. Three rules keep it consistent with checkout, and they apply to any drawer, mini cart or slide-out cart you build:

- **Price it on the server.** Most pages are cached, and the browser only holds the test prices for its own page key, or none on a page no test changes. A drawer priced in the browser shows the original price for every other product, while checkout charges the test price. Here the drawer's contents come from a server action (`lib/drawer.ts`). Lines and the subtotal use Shopify's cart cost: once the cart carries ABConvert's attributes, Shopify applies the test price to it, so it is exactly what checkout charges. Recommendations, which are not in the cart yet, are priced by the ABConvert client built from the request.
- **Check the cart attributes when the shopper checks out.** The drawer's Checkout button calls `startCheckout`, which writes the attributes again if they no longer match the visitor's tests, then sends the shopper to checkout. Without it, a cart made before a test launched shows the test price in the drawer and checks out at the original price.
- **Treat every add as an add to cart.** The drawer's recommendation buttons write the line attributes on the server and call `track('product_added_to_cart')`, as the product page does.

## Checkout

- Shopify recommends putting checkout on a subdomain of your storefront's domain, such as `checkout.example.com` for `example.com`, so the shopper's consent carries into checkout. See [Shopify's consent guide](https://shopify.dev/docs/storefronts/headless/hydrogen/analytics/consent).
- The cart ID carries a secret key. This store keeps it in an httpOnly cookie and never puts it in a page, as [Shopify asks](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage).
- Checkout charges the test price only when the cart has ABConvert's attributes. If checkout shows the original price, open **Cart attributes** on the cart page: `groupInfo` must name the test.

## Check your own store

`scripts/check.mjs` checks the routing and caching rules with plain HTTP requests. Point it at a product page a running price test covers, and one no test covers:

```bash
BASE=http://localhost:8080 TESTED=/products/your-tested-product UNTESTED=/products/another-product npm run check
```

## The SDK package

The store installs [`@abconvert/headless`](https://www.npmjs.com/package/@abconvert/headless) from npm. Its five entries are `@abconvert/headless`, `/react`, `/next`, `/hydrogen` and `/hydrogen/analytics-provider`; this store uses the first three.

## Next.js versions

The SDK supports the App Router on Next.js 14, 15.1 to 15.4, and 16. Next.js 15.5 renders every page a middleware rewrites on every request, with or without ABConvert, and 15.0 does not cache a page on its first request. On Next.js 16, rename `middleware.ts` to `proxy.ts` and its function to `proxy` (`npx @next/codemod@canary middleware-to-proxy .`).

## Project layout

```
middleware.ts                       locale rewrite + ABConvert plan
next.config.mjs                     Cache-Control rule for product and collection pages
lib/abconvert.ts                    SDK options, country
lib/shopify.ts                      Storefront API: catalog and cart
lib/request.ts                      the shopper's country and IP
lib/cart.ts                         the visitor's cart and its attribute check
lib/drawer.ts                       the cart drawer's contents, priced on the server
app/actions.ts                      Add to Cart, Buy Now, country
app/[locale]/(store)/               pages no test changes for this visitor
app/[locale]/abconvert/[pageKey]/   the same pages, rendered from a page key
components/                         price, tracking, cart buttons, cart drawer, debug panel
scripts/cdn.mjs                     Google Cloud CDN stand-in
scripts/check.mjs                   routing and caching checks
app/api/revalidate/route.ts         on-demand revalidation of a product page, both routes
```

This store sells one product variant per product and has no customer accounts. To target customers, pass `customer` to the SDK from your customer session: see [Targeting](https://docs.abconvert.io/headless-sdk/targeting#customer).
