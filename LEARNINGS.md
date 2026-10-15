# What we learned building this store

Short notes from building and testing this store against a Shopify dev store and ABConvert, October 2026. Each one cost us time once. Read them before you integrate.

## Four caches, four rules

A headless store has four places that hold a copy of something, and each has its own rule.

| Layer | What it holds | Rule |
|---|---|---|
| CDN | Whole pages, keyed by path | Never store a page that differs per visitor. The SDK marks those `private`. |
| Next.js | Whole pages, keyed by the route | One copy per page key, so one per combination of test groups. A change to a test gives a new key. |
| SDK, on each server | Your tests | Fresh for 60 seconds, then refreshed behind the next request. Only a server with no copy waits, for at most 1 second. |
| Browser | The page's tests and prices | Only the prices for that page's key. A product outside the key has no test price in the browser. |

## Price tests touch almost every page

- While any price test runs, every home, collection, search and product page is `private` to a path-keyed CDN. Those pages still come from Next.js's cache, so they are not re-rendered per visit. What you lose is the CDN hit.
- The SDK decides from the URL alone, by Shopify's URL conventions. A page with prices at another path, such as `/deals` or a brand page, gets no page key and no `private`. Render such pages per request, or give them a URL the SDK knows.
- `onlyOwnProductPrices` is a promise that your product pages show no other product's price. Keep it off if they show related products, bundles or recommendations.

## Let the CDN cache tested pages, in the right order

- Google Cloud CDN can key on up to five named cookies on a backend service. Add `abconvert-key` to the key, then turn on `cdnKeyedByCookie`. Turn it off in reverse.
- With the SDK option on and a path-only CDN key, the CDN stores one test group's page and serves it to everyone. Nothing warns you.
- The cookie covers every price test, so it splits the cache for untested pages too. Route product, collection and search paths through their own backend service.
- Cloud CDN never stores a response with `Set-Cookie`, `private` or `no-store`. It does not store a response whose `Vary` names a header outside its allowed list, and Next.js adds `Vary: RSC`. Rewrite `Vary` to `Accept-Encoding` in front of Next.js.

## Next.js specifics

- A click inside the site is not a page load. Next.js fetches the new page's content with an `RSC` header, and the CDN never caches those. Pressing Back after a server action, such as Add to Cart, fetches the page without the `next-url` header. Early SDK versions treated that as a non-page request and skipped the page key, so Back showed the original price. Fixed in the SDK on 2026-10-14.
- Reading cookies or `useSearchParams()` in a page makes it render per request. Key page view tracking on the path only.
- Next.js 15.0 does not cache a page on its first request, and 15.5 renders every page behind a middleware rewrite on every request. Use 14, 15.1 to 15.4, or 16.
- A middleware `Cache-Control` value wins over a `headers()` rule in `next.config`. A proxy that rewrites `Cache-Control` in front of Next.js must keep `private`.

## Cart, drawer and checkout

- Checkout charges what the cart attributes say. Write them on every cart change, and check them again on the cart page and in the drawer before the Checkout button, because a cart made before a launch has none for the new test.
- Once the attributes are on the cart, Shopify's own cart already applies the test price: a line's `cost.amountPerQuantity` and the cart's `cost.subtotalAmount` include it, while the product variant's `price` stays the original. Show the line cost in your cart and drawer. It is exactly what checkout charges, also in the minutes after a test changes.
- A cart drawer opens on cached pages, and the browser only holds the current page's test prices. Price the drawer on the server: cart lines from Shopify's cart cost, recommendations from the SDK client built from the request.
- Every add to cart, including from a drawer's recommendations, writes the line attributes and tracks `product_added_to_cart`.

## After you launch, edit or end a test

- Pages can show the old price for about two minutes: up to 60 seconds for the SDK's copy plus up to 60 seconds at the CDN. Next.js adds nothing, because the page key changes.
- Shorten it by changing tests at quiet hours, clearing the CDN for product, collection and search paths, or calling `refreshTests()` on each server. ABConvert sends no webhook yet.
- Ending is the safe direction. Checkout charges the original price as soon as Shopify no longer has the test, whatever an old cart says.

## Tracking

- The SDK sends events only for a visitor in at least one running test, and never for a forced or preview visit. "No events" during QA usually means no test is live, or the window still carries a forced test group.
- The SDK sends with `sendBeacon`. Chrome DevTools lists those under "Other", so the "Fetch/XHR" filter hides them.
- Page views alone do not feed product results or engagement metrics. The SDK needs `product_viewed` on product pages, and it derives click-through, scroll and time on page from `page_viewed`. Both were added to the SDK on 2026-10-15.

## Preview and forcing

- A test in Preview is not in the tests the store loads. Its preview link carries a preview key; append `abconvert_force=<test ID>:<index>` to pick a test group. The key is remembered for the rest of the visit.
- Test groups count from 0. Control is 0, Variant A is 1.
- A forced test group stays in the `abconvert-state` cookie for a year. Use a private window to test as a new visitor.

## Loading failures

- A request that times out shows the original store and logs nothing unless you pass `onError`. Pass it. The reference store did not at first, and a cold-start timeout looked like an SDK bug.
- In this store a short `cacheTtl` made every request wait on a fetch, and any slow one fell back to the original store. Keep the default 60 seconds in production.

## Shopify's Headless channel

- Use the private access token on the server, in `Shopify-Storefront-Private-Token`. Never send it to the browser.
- Send the shopper's IP in `Shopify-Storefront-Buyer-IP` on requests a shopper causes, or Shopify may throttle them.
- Set the cart's country in `buyerIdentity.countryCode`, and query prices with `@inContext(country:)`, so cart and checkout charge that market.
- The cart ID carries a secret key. Keep it in an httpOnly cookie.
- Put checkout on a subdomain of the storefront's domain, so consent carries over.
- A dev store shows its password page before checkout. A headless browser cannot get past it, so finish checkout checks in a real browser.
- `productRecommendations` needs a product ID. It works on mock.shop and on a dev store.
