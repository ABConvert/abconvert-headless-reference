// The cart drawer's contents, built on the server.
//
// A drawer can open on any page, and most pages are cached: the browser only
// holds the prices for its own page key, or none on a page no test changes.
// So the drawer never prices in the browser. It asks the server: cart lines
// and the subtotal come from Shopify's cart cost, which already includes the
// test price, and recommendations from the client built from the request,
// which knows the visitor and prices every product.
import 'server-only';
import type { CartContext } from './cart';
import { testPrice } from './price';
import { getRecommendations, type Cart, type Money, type Product } from './shopify';

export interface DrawerPrice {
  amount: string;
  compareAt: string | null;
  /** The price test that set it, for the exposure once it is on screen. */
  experimentId: string | null;
}
/** A cart line: `amount` is the line's total, `each` the unit price when there is more than one. */
export interface DrawerLine extends DrawerPrice { id: string; title: string; handle: string; image: string | null; quantity: number; each: string | null }
export interface DrawerProduct extends DrawerPrice { productId: string; variantId: string; title: string; handle: string; image: string | null }
export interface Drawer {
  lines: DrawerLine[];
  count: number;
  subtotal: string;
  recommendations: DrawerProduct[];
  offers: { experimentId: string; title: string }[];
  error?: string;
}

function priced(context: CartContext, product: Product): DrawerPrice {
  const tested = testPrice(context.abconvert, product);
  const currency = tested?.currency ?? product.price.currency;
  const value = tested?.amount ?? product.price.amount;
  const compare = tested ? tested.compareAtAmount : product.compareAtPrice?.amount ?? null;
  return {
    amount: context.abconvert.formatPrice(value, currency),
    compareAt: compare !== null && compare > value ? context.abconvert.formatPrice(compare, currency) : null,
    experimentId: tested?.experimentId ?? null,
  };
}

export async function drawerFor(cart: Cart | null, context: CartContext): Promise<Drawer> {
  const format = (money: Money) => context.abconvert.formatPrice(money.amount, money.currency);
  // A line in the cart shows Shopify's own line cost: it already includes the
  // test price, so it is exactly what checkout charges. The SDK only names the
  // price test, for the exposure.
  const lines = (cart?.lines ?? []).map((line) => ({
    id: line.id,
    title: line.title,
    handle: line.handle,
    image: line.image?.url ?? null,
    quantity: line.quantity,
    amount: format(line.total),
    each: line.quantity > 1 ? format(line.cost) : null,
    compareAt: null,
    experimentId: testPrice(context.abconvert, line)?.experimentId ?? null,
  }));

  // A recommendation is not in the cart yet, so the SDK prices it.
  const inCart = new Set((cart?.lines ?? []).map((line) => line.productId));
  const related: Product[] = cart?.lines[0] ? await getRecommendations(cart.lines[0].productId, context.country).catch(() => []) : [];
  const recommendations = related
    .filter((product) => !inCart.has(product.id))
    .slice(0, 4)
    .map((product) => ({ productId: product.id, variantId: product.variantId, title: product.title, handle: product.handle, image: product.image?.url ?? null, ...priced(context, product) }));

  return {
    lines,
    count: (cart?.lines ?? []).reduce((sum, line) => sum + line.quantity, 0),
    subtotal: cart?.lines.length ? format(cart.subtotal) : '',
    recommendations,
    offers: lines.length ? context.abconvert.getOffers().map((offer) => ({ experimentId: offer.experimentId, title: offer.title })) : [],
  };
}
