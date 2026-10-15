// The cart drawer's contents, built on the server.
//
// A drawer can open on any page, and most pages are cached: the browser only
// holds the prices for its own page key, or none on a page no test changes.
// So the drawer never prices in the browser. It asks the server, where the
// client built from the request knows the visitor and prices every product:
// the cart's lines, the recommendations and the subtotal.
import 'server-only';
import type { CartContext } from './cart';
import { getRecommendations, type Cart, type Money, type Product } from './shopify';

export interface DrawerPrice {
  amount: string;
  compareAt: string | null;
  /** The price test that set it, for the exposure once it is on screen. */
  experimentId: string | null;
}
export interface DrawerLine extends DrawerPrice { id: string; title: string; handle: string; image: string | null; quantity: number }
export interface DrawerProduct extends DrawerPrice { productId: string; variantId: string; title: string; handle: string; image: string | null }
export interface Drawer {
  lines: DrawerLine[];
  count: number;
  subtotal: string;
  recommendations: DrawerProduct[];
  offers: { experimentId: string; title: string }[];
  error?: string;
}

function priced(context: CartContext, variantId: string, price: Money, compareAt: Money | null): DrawerPrice & { value: number } {
  const tested = context.abconvert.getPriceByVariantId(variantId);
  const currency = tested?.currency ?? price.currency;
  const value = tested?.amount ?? price.amount;
  const compare = tested ? tested.compareAtAmount : compareAt?.amount ?? null;
  return {
    value,
    amount: context.abconvert.formatPrice(value, currency),
    compareAt: compare !== null && compare > value ? context.abconvert.formatPrice(compare, currency) : null,
    experimentId: tested?.experimentId ?? null,
  };
}

export async function drawerFor(cart: Cart | null, context: CartContext): Promise<Drawer> {
  const lines = (cart?.lines ?? []).map((line) => {
    const { value, ...price } = priced(context, line.variantId, line.price, null);
    return { line: { id: line.id, title: line.title, handle: line.handle, image: line.image?.url ?? null, quantity: line.quantity, ...price }, total: value * line.quantity, currency: line.price.currency };
  });

  // Related to the first product in the cart, minus what is already in it.
  const inCart = new Set((cart?.lines ?? []).map((line) => line.productId));
  const related: Product[] = cart?.lines[0] ? await getRecommendations(cart.lines[0].productId, context.country).catch(() => []) : [];
  const recommendations = related
    .filter((product) => !inCart.has(product.id))
    .slice(0, 4)
    .map((product) => {
      const { value: _value, ...price } = priced(context, product.variantId, product.price, product.compareAtPrice);
      return { productId: product.id, variantId: product.variantId, title: product.title, handle: product.handle, image: product.image?.url ?? null, ...price };
    });

  const subtotal = lines.reduce((sum, entry) => sum + entry.total, 0);
  return {
    lines: lines.map((entry) => entry.line),
    count: (cart?.lines ?? []).reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.length ? context.abconvert.formatPrice(subtotal, lines[0].currency) : '',
    recommendations,
    offers: lines.length ? context.abconvert.getOffers().map((offer) => ({ experimentId: offer.experimentId, title: offer.title })) : [],
  };
}
