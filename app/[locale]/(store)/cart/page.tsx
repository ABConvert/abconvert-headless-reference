// The cart page renders per visitor, so it can read what a cached page cannot:
// the visitor's offers and free shipping threshold. It checks the cart
// attributes before showing the Checkout button (lib/cart.ts), as the drawer
// does at its Checkout click, and shows Shopify's line cost, which already
// includes the test price.
// https://docs.abconvert.io/headless-sdk/cart
import Link from 'next/link';
import { cartContext, currentCart } from '@/lib/cart';
import { CheckoutLink } from '@/components/CheckoutLink';
import { Exposure } from '@/components/Exposure';

export const dynamic = 'force-dynamic';
export const metadata = { alternates: { canonical: '/cart' }, robots: { index: false } };

export default async function CartPage() {
  const context = await cartContext();
  const { abconvert } = context;
  const cart = await currentCart(context);

  // Shopify's line cost and subtotal already include the test price: they are what checkout charges.
  const lines = cart?.lines ?? [];
  const subtotal = cart?.subtotal.amount ?? 0;
  // The price tests behind the lines, for the exposure once they are on screen.
  const tested = [...new Set(lines.flatMap((line) => abconvert.getPriceByVariantId(line.variantId)?.experimentId ?? []))];
  const offers = lines.length ? abconvert.getOffers() : [];
  const threshold = lines.length ? abconvert.getFreeShippingThreshold() : null;

  return (
    <div className="cart">
      <h1>Cart</h1>
      {tested.map((id) => <Exposure key={id} experimentId={id} />)}
      {offers.map((offer) => (
        <div key={offer.experimentId} className="banner">
          {offer.title}
          <Exposure experimentId={offer.experimentId} />
        </div>
      ))}
      {threshold ? (
        <div className="banner">
          {subtotal >= threshold.amount ? 'You have free shipping.' : `Add ${abconvert.formatPrice(threshold.amount - subtotal, threshold.currency)} more for free shipping.`}
        </div>
      ) : null}
      {!cart || !lines.length ? (
        <p>Your cart is empty. <Link href="/">Continue shopping</Link></p>
      ) : (
        <>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td><Link href={`/products/${line.handle}`}>{line.title}</Link></td>
                  <td>{line.quantity}</td>
                  <td className="price">{abconvert.formatPrice(line.cost.amount, line.cost.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Subtotal: <strong>{abconvert.formatPrice(cart.subtotal.amount, cart.subtotal.currency)}</strong></p>
          <CheckoutLink href={cart.checkoutUrl} />
          <details className="muted">
            <summary>Cart attributes</summary>
            <pre>{JSON.stringify({ cart: cart.attributes, lines: cart.lines.map((line) => line.attributes) }, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}
