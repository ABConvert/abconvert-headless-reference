# Integration notes

What to know before you add ABConvert to a Next.js storefront. Each note is a rule the reference store follows, and why. Read them before you integrate, and again before you launch your first test.

## Four caches, four rules

A headless store holds a copy of something in four places. Each has its own rule.

| Layer | What it holds | Rule |
|---|---|---|
| Your CDN | Whole pages, keyed by path | It must never store a page that differs per visitor. The SDK marks those `private`. |
| Next.js | Whole pages, keyed by route | One copy per page key, so one per combination of test groups. A change to a test gives a new key. |
| The SDK, on each server | Your tests | Fresh for 60 seconds, then refreshed behind the next request. Only a server with no copy waits, for at most 1 second. |
| The browser | The page's tests and prices | Only the prices for that page's key. A product outside the key has no test price in the browser. |

## A price test touches almost every page

- While a price test runs, every home, collection, search and product page is `private` to a path-keyed CDN. Those pages still come from Next.js's cache, so they are not rendered per visit. What you lose is the CDN hit.
- The SDK decides from the URL alone, by Shopify's URL conventions. A page with prices at another path, such as `/deals` or a brand page, gets no page key and no `private`. Render such pages per request, or give them a URL the SDK knows.
- `onlyOwnProductPrices` is a promise that your product pages show no other product's price. Keep it off if they show related products, bundles or recommendations.

## Let your CDN cache tested pages, in the right order

- Google Cloud CDN can key on up to five named cookies on a backend service. Add `abconvert-key` to the key first, then turn on `cdnKeyedByCookie`. Turn it off in reverse.
- With the SDK option on and a path-only CDN key, the CDN stores one test group's page and serves it to everyone. Nothing warns you.
- The cookie covers every price test, so it splits the cache for untested pages too. Route product, collection and search paths through their own backend service.
- Cloud CDN never stores a response with `Set-Cookie`, `private` or `no-store`. It does not store a response whose `Vary` names a header outside its allowed list, and Next.js adds `Vary: RSC`. Rewrite `Vary` to `Accept-Encoding` in front of Next.js.

## Next.js

- A click inside your site is not a page load. Next.js fetches the new page's content with an `RSC` header, and a CDN never caches those, so they always reach the middleware. The SDK plans those fetches too, including the Back button after a server action such as Add to Cart.
- Reading cookies or `useSearchParams()` in a page makes it render per request. Key your page view tracking on the path only.
- Use Next.js 14, 15.1 to 15.4, or 16. Version 15.0 does not cache a page on its first request, and 15.5 renders every page behind a middleware rewrite on every request.
- A middleware `Cache-Control` value wins over a `headers()` rule in `next.config`. A proxy that rewrites `Cache-Control` in front of Next.js must keep `private`.
- Keep non-page routes out of the middleware matcher: route handlers, webhooks, anything under `/api`. A script's request has no browser headers, so the SDK would take it for a page load, assign it a test group and set cookies.
- On-demand revalidation by path refreshes the usual route only. A tested product page also has copies under the page key route, so revalidate that route by pattern too: `revalidatePath('/[locale]/abconvert/[pageKey]/products/[handle]', 'page')`. `app/api/revalidate/route.ts` shows both calls.
- A server action from a tested page is rewritten to the page's key, so its response renders from the same route as the page. That needs the `next-action` header JavaScript sends; a form posted before hydration, or with JavaScript off, renders from the usual route until the next page load.

## Cart, drawer and checkout

- Checkout charges what the cart attributes say. Write them on every cart change, and check them again on the cart page and in the drawer before the Checkout button. A cart made before a launch has none for the new test.
- Once the attributes are on the cart, Shopify's own cart already applies the test price: a line's `cost.amountPerQuantity` and the cart's `cost.subtotalAmount` include it, while the product variant's `price` stays the original. Show the line cost in your cart and drawer. It is exactly what checkout charges, also in the minutes after a test changes.
- A cart drawer opens on cached pages, and the browser holds only the current page's test prices. Price the drawer on the server: cart lines from Shopify's cart cost, recommendations from the SDK client built from the request.
- Every add to cart, including from a drawer's recommendations, writes the line attributes and tracks `product_added_to_cart`.

## After you launch, edit or end a test

- Pages can show the old price for about two minutes: up to 60 seconds for the SDK's copy plus up to 60 seconds at your CDN. Next.js adds nothing, because the page key changes.
- Shorten it by changing tests at quiet hours, clearing your CDN for product, collection and search paths, or calling `refreshTests()` on each server.
- Ending is the safe direction. Checkout charges the original price as soon as Shopify no longer has the test, whatever an old cart says.

## Tracking

- The SDK sends events only for a visitor in at least one running test, and never for a forced or preview visit. "No events" during a check usually means no test is live, or the window still carries a forced test group.
- The SDK sends with `sendBeacon`. Chrome DevTools lists those under "Other", so the "Fetch/XHR" filter hides them.
- Call `track('page_viewed')` on every navigation and `track('product_viewed')` on product pages. Page views feed engagement metrics; product views feed product results and product group results.

## Preview and forcing

- A test in Preview shows only in a preview session. Its preview link carries a preview key; append `abconvert_force=<test ID>:<index>` to pick a test group. The key is remembered for the rest of the visit.
- A test in Preview still makes the pages it could change `private` at your CDN, for every visitor, so the preview link is never answered from a stored page. Do not leave a price test in Preview for days: preview it, then launch it or move it back to Draft.
- Test groups count from 0. Control is 0, Variant A is 1.
- A forced test group stays in the `abconvert-state` cookie for a year. Use a private window to check as a new visitor.

## Loading failures

- A request that times out shows the original store and logs nothing unless you pass `onError`. Pass it, so a timeout does not look like a missing test.
- Keep the default `cacheTtl` of 60 seconds in production. A short value makes requests wait on fetches, and a slow one shows the original store.

## Shopify's Headless channel

- Use the private access token on the server, in `Shopify-Storefront-Private-Token`. Never send it to the browser.
- Send the shopper's IP in `Shopify-Storefront-Buyer-IP` on requests a shopper causes, or Shopify may throttle them.
- Set the cart's country in `buyerIdentity.countryCode`, and query prices with `@inContext(country:)`, so cart and checkout charge that market.
- The cart ID carries a secret key. Keep it in an httpOnly cookie.
- Put checkout on a subdomain of your storefront's domain, so consent carries over.
- A dev store shows its password page before checkout. A headless browser cannot get past it, so finish checkout checks in a real browser.
