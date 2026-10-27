// The visitor's test price for a product variant, or null outside a price
// test. A test by product type changes every product of a type by a rule, so
// the SDK needs the product's type and the prices the rule changes. They
// change nothing for a test of specific products: pass them on every read.
// https://docs.abconvert.io/headless-sdk/prices#prices-of-a-test-by-product-type-beta
import type { ABConvert } from '@abconvert/headless';
import type { Money } from './shopify';

/** A product variant as the Storefront API returns it: a product, a recommendation or a cart line. */
export interface Priced { variantId: string; productType: string; price: Money; compareAtPrice: Money | null }

export function testPrice(abconvert: ABConvert, product: Priced) {
  // Takes the Storefront API ID as returned.
  return abconvert.getPriceByVariantId(product.variantId, {
    productType: product.productType,
    basePrice: product.price.amount,
    compareAtPrice: product.compareAtPrice?.amount ?? null,
  });
}
