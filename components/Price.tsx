// A price as the store shows it: the visitor's test price when a price test
// includes the product variant, else the Storefront API price. When a test
// price is on screen, the exposure records that the visitor saw it.
// https://docs.abconvert.io/headless-sdk/prices#show-a-test-price
import type { ABConvert } from '@abconvert/headless';
import { testPrice, type Priced } from '@/lib/price';
import { Exposure } from './Exposure';

const format = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export function Price({ product, abconvert }: { product: Priced; abconvert: ABConvert | null }) {
  const tested = abconvert ? testPrice(abconvert, product) : null;
  const amount = tested ? tested.amount : product.price.amount;
  const currency = tested ? tested.currency : product.price.currency;
  const compareAt = tested ? tested.compareAtAmount : product.compareAtPrice?.amount ?? null;
  const show = (value: number) => (abconvert ? abconvert.formatPrice(value, currency) : format(value, currency));
  return (
    <span className="price">
      {show(amount)}
      {compareAt !== null && compareAt > amount ? <s className="compare">{show(compareAt)}</s> : null}
      {tested ? <Exposure experimentId={tested.experimentId} /> : null}
    </span>
  );
}
