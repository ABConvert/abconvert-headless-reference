# Test the SDK as a customer

Use a disposable Shopify development store. This walkthrough uses the published npm SDK, real Shopify carts and checkout, and ABConvert results. The default sample catalog is useful for browsing but cannot prove ABConvert integration or purchase attribution.

## 1. Prepare the store

Before installing local dependencies, confirm:

- Node.js 20+ is available (`@abconvert/headless` requires it).
- A Shopify dev store has products with stock, a shipping rate for the test address, and a test payment gateway. Plus is appropriate for testing the price-test Shopify Function.
- The same store has Shopify's Headless channel and ABConvert installed.
- Your ABConvert contact has turned on the headless SDK for this store. Confirm **Integrations → Headless Storefront** appears.
- ABConvert onboarding is complete and the store can create a price test. For manual app billing, the developer must issue a **test charge**, or arrange complimentary dev-store access. A real subscription screen requesting a billing card is not the intended test setup. Do not confuse app billing with the shopper's test payment gateway.
- ABConvert's analytics web pixel is enabled; confirm its status in Settings. Loading SDK configuration alone does not verify event collection.

If launching a test asks for a theme review, contact ABConvert to confirm your headless setup. The SDK does not skip ABConvert's launch checks.

## 2. Connect the reference store

Follow the README's Headless token instructions. Products must be available to the Headless sales channel. Keep the private token on the server.

```bash
npm ci
cp .env.example .env.local
```

Set the Shopify domain and private token, `ABCONVERT_SHOP`, and the public storefront key created in **Integrations → Headless Storefront**. On that page, save `http://localhost:8080` as the **Storefront URL** so preview links open on the reference store. Set these before building:

```dotenv
SITE_URL=http://localhost:8080
NEXT_PUBLIC_ABCONVERT_DEBUG=1
```

```bash
npm run typecheck
npm run build
npm run start
# In a second terminal:
npm run cdn
```

Browse `http://localhost:8080`. Use the production build: development mode does not exercise production caching. Keep the default path-keyed CDN mode for the first test. Don't enable cookie-keyed mode until you have applied both cookie and query cache-key settings from the README.

When changing the configured shop, use a fresh browser profile or clear the local storefront's site data. The same localhost origin can otherwise retain assignments, preview sessions, and a cart from another shop. A changed environment file requires a rebuild and a restart. Never commit environment files, checkout URLs containing cart secrets, or raw visitor data.

## 3. Price test: display through checkout

1. Choose a stocked, single-variant product. Record its handle and original price.
2. Create a price test with a 50/50 split, a clear Variant A price difference, and a priced market matching the country selected in the reference store. Leave it in Preview.
3. Copy the preview link. Its origin is `http://localhost:8080` when that is the saved storefront URL; otherwise replace it. Replace its path with `/products/YOUR_HANDLE`, retaining its query parameters. Set `abconvert_force=TEST_ID:1` (append with `&` if the URL already has a query). Use the numeric ID from the app or the identifier supplied in its preview link; Control is index `0`, Variant A is `1`.
4. Verify Variant A on the product, a collection containing it, search, the cart drawer, and the cart page. Check compare-at prices if configured.
5. Check the line price through all four entry points: drawer Checkout, cart-page Checkout, Buy Now, and Buy with Shop Pay. Record whether Shop Pay actually opens or Shopify falls back to standard checkout. A correct cart-permalink price alone does not prove native Shop Pay.
6. Force Control and repeat. Open a cart created under Variant A and confirm it reconciles to Control. Also test quantity changes and drawer recommendations.

Preview and forced visits are QA: they are excluded from test results. They verify routing and prices, not attribution.

## 4. URL redirect: source through destination

Use two existing paths, for example:

- Source, **Exactly matches**: `/collections/hydrogen`
- Control: stays on the source
- Variant A: `/products/the-collection-snowboard-hydrogen?landing=redirect`
- Behavior: **Redirect every time they visit the matching page**
- **Keep URL parameters when redirecting**: on

Substitute paths from your store. Preview both groups through the local origin as above, this time visiting the source path. Confirm:

1. Control stays on the source; Variant reaches the destination on the **local headless origin**, not the Shopify theme domain.
2. With `utm_source=sdk-e2e` on the source, the destination retains it and adds `landing=redirect`. An existing source value wins over a destination default with the same name when preservation is enabled.
3. A direct page load, an internal Next.js link to the source, reload, and Back and Forward behave consistently without a redirect loop.
4. Repeat source visits follow the configured mode. Test **first visit only** separately with a fresh unforced browser session; the HTTP script below assumes every-visit mode.
5. Unmatched paths still render normally. If a price test runs concurrently, the destination retains that visitor's assigned price.

Launch the redirect test only on your disposable dev store, then run:

```bash
BASE=http://localhost:8080 \
REDIRECT_TEST_ID=12345 \
REDIRECT_SOURCE=/collections/hydrogen \
REDIRECT_DESTINATION='/products/the-collection-snowboard-hydrogen?landing=redirect' \
npm run check:redirect
```

This checks an **active**, exact-path, every-visit test with preserved query parameters behind the default path-keyed CDN. It verifies routing for Control and the variant, private responses, campaign parameters, repeat assignment, destination rendering, crawler exclusion, and loop protection. It doesn't prove browser events or purchase attribution. Don't run it against a first-visit-only test or cookie-keyed CDN configuration.

A test you just launched or edited can take up to about two minutes to reach the SDK and pages the CDN already stored; see the README's cache discussion. Record an initial failure and its timing before rerunning. Do not silently retry until a check passes.

## 5. Verify a natural visitor and an order

Use a fresh browser profile with no preview or forced-assignment cookies. Removing query parameters alone does not clear those sessions. Launch the test, visit the source or product page without QA parameters, and confirm the natural group. For redirects, check both a visitor who stays on the source and one who lands on the destination. Do not force groups to manufacture analytics traffic.

- Confirm assignments, exposures and navigation events reach ABConvert. The SDK uses `sendBeacon`; DevTools' **Other** filter can show them. Server rendering a price or redirect is not proof of ingestion.
- Shopify dev stores are password protected. Enter the existing storefront password from **Online Store → Preferences** before testing checkout; leave protection enabled. After password entry, reopen checkout from the reference store if Shopify lands you on its home page.
- If checkout explicitly shows **Test Payment Gateway**, use card number `1` for success, any future expiry, any three-digit security code, and a test cardholder name. Use synthetic customer details and don't save payment information. These values are for Shopify's test gateway, not app-subscription billing or a real gateway.
- Complete one test order. Record its order number, group, expected price, and submission time; verify Shopify labels it a test order.
- In Shopify order details, verify the cart and line attributes include the SDK source, the visitor and session, and the test assignment. In this integration, `groupInfo` carries pricing groups; line `_abconvert-assignment` can carry other tests' groups too.
- Refresh ABConvert results and verify the order and revenue under the expected test group. Visitor counts, Shopify order metadata, and ABConvert revenue are separate checks.

There is no verified reporting-latency guarantee in this reference. Record when the event or order was sent and when it appeared. If redirect routing works but visitor counts stay at zero, keep tracking marked **unverified**, collect the observations below, and ask ABConvert to investigate. Don't submit another order merely to retry ingestion.

## 6. Record the outcome

```bash
BASE=http://localhost:8080 \
TESTED=/products/YOUR_TESTED_HANDLE \
UNTESTED=/products/YOUR_UNTESTED_HANDLE \
npm run check
```

The output reports passed and failed checks and skipped groups. Missing inputs mean incomplete coverage. HTTP checks don't cover checkout or analytics.

For a support report, include SDK version (`npm ls @abconvert/headless`), reference commit, Node version, test ID and status, selected market, paths, expected and actual price or redirect, cache headers, timestamps, and sanitized screenshots. Keep credentials, preview keys, cart secrets, and customer data private.

Record each stage separately: setup, preview, natural assignment, browser navigation, cart, Shopify checkout and order, event receipt, and ABConvert attribution. Pause or end disposable tests after collecting evidence, then verify ordinary routing and prices return after caches refresh.
