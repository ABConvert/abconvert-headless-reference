// A price as the store shows it: the visitor's test price when a price test
// includes the product variant, else the Storefront API price. When a test
// price is on screen, the exposure records that the visitor saw it.
// https://docs.abconvert.io/headless-sdk/prices#show-a-test-price
import type { ABConvert } from '@abconvert/headless';
import type { Money } from '@/lib/shopify';
import { Exposure } from './Exposure';

const format = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export function Price({ variantId, price, compareAtPrice, abconvert }: { variantId: string; price: Money; compareAtPrice: Money | null; abconvert: ABConvert | null }) {
  // Takes the Storefront API ID as returned. Null outside a price test.
  const tested = abconvert?.getPriceByVariantId(variantId) ?? null;
  const amount = tested ? tested.amount : price.amount;
  const currency = tested ? tested.currency : price.currency;
  const compareAt = tested ? tested.compareAtAmount : compareAtPrice?.amount ?? null;
  const show = (value: number) => (abconvert ? abconvert.formatPrice(value, currency) : format(value, currency));
  return (
    <span className="price">
      {show(amount)}
      {compareAt !== null && compareAt > amount ? <s className="compare">{show(compareAt)}</s> : null}
      {tested ? <Exposure experimentId={tested.experimentId} /> : null}
    </span>
  );
}
