// The cart page renders per visitor, so it can read what a cached page cannot:
// the visitor's offers and free shipping threshold. It checks the cart
// attributes before showing the Checkout button (lib/cart.ts), as the drawer
// does at its Checkout click.
// https://docs.abconvert.io/headless-sdk/cart
import Link from 'next/link';
import { cartContext, currentCart } from '@/lib/cart';
import { Price } from '@/components/Price';
import { Exposure } from '@/components/Exposure';

export const dynamic = 'force-dynamic';
export const metadata = { alternates: { canonical: '/cart' }, robots: { index: false } };

export default async function CartPage() {
  const context = await cartContext();
  const { abconvert } = context;
  const cart = await currentCart(context);

  const lines = (cart?.lines ?? []).map((line) => ({ line, amount: abconvert.getPriceByVariantId(line.variantId)?.amount ?? line.price.amount }));
  const subtotal = lines.reduce((sum, { line, amount }) => sum + amount * line.quantity, 0);
  const currency = cart?.lines[0]?.price.currency ?? 'USD';
  const offers = lines.length ? abconvert.getOffers() : [];
  const threshold = lines.length ? abconvert.getFreeShippingThreshold() : null;

  return (
    <div className="cart">
      <h1>Cart</h1>
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
              {lines.map(({ line }) => (
                <tr key={line.id}>
                  <td><Link href={`/products/${line.handle}`}>{line.title}</Link></td>
                  <td>{line.quantity}</td>
                  <td><Price variantId={line.variantId} price={line.price} compareAtPrice={null} abconvert={abconvert} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Subtotal: <strong>{abconvert.formatPrice(subtotal, currency)}</strong></p>
          <a className="button primary" href={cart.checkoutUrl}>Checkout</a>
          <details className="muted">
            <summary>Cart attributes</summary>
            <pre>{JSON.stringify({ cart: cart.attributes, lines: cart.lines.map((line) => line.attributes) }, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}
