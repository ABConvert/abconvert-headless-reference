// The SDK options, in one place: the middleware, the layouts, the pages and
// the cart actions all read them.
// https://docs.abconvert.io/headless-sdk/nextjs#step-2-add-the-middleware
import type { NextOptions } from '@abconvert/headless/next';

export const abconvertOptions: NextOptions = {
  shop: process.env.ABCONVERT_SHOP || '',
  storefrontKey: process.env.ABCONVERT_STOREFRONT_KEY || '',
  // Only for a staging or development ABConvert backend; unset in production.
  ...(process.env.ABCONVERT_BASE_URL ? { baseUrl: process.env.ABCONVERT_BASE_URL } : {}),
  // Product pages here show no price but their own product's, so a product page
  // is keyed only by the price tests that include its product. Remove this if
  // your product pages show related products with prices.
  onlyOwnProductPrices: true,
  // Lets your CDN cache tested pages, one copy per combination of test groups.
  // Turn it on only after your CDN adds the `abconvert-key` cookie and the query
  // parameters `abconvert_force`, `abconvert_preview_key` and
  // `abconvert_experiment_id` to its cache key, and turn it off before you
  // remove them. In the other
  // order, a CDN that caches by path alone serves one test group's page to everyone.
  // https://docs.abconvert.io/headless-sdk/nextjs#cache-tested-pages-at-your-cdn
  cdnKeyedByCookie: process.env.ABCONVERT_CDN_KEYED_BY_COOKIE === '1',
  // A failed or slow load shows the original store for that request. Log it.
  onError: (error) => console.error('[abconvert]', error.message),
};

/** The header's country selector writes this cookie. It is the Storefront API `@inContext` country and the SDK's `country`. */
export const COUNTRY_COOKIE = 'country';
export const COUNTRIES = ['US', 'CA'] as const;
export type Country = (typeof COUNTRIES)[number];

export function countryOf(value: string | undefined | null): Country {
  return (COUNTRIES as readonly string[]).includes(value ?? '') ? (value as Country) : 'US';
}
