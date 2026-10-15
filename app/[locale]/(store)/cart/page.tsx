// The cart renders per visitor, so it can read what a cached page cannot: the
// visitor's shipping rates, free shipping threshold and offers. Checkout
// charges what the cart attributes say, so the page writes them again when
// they no longer match the visitor's tests (for example after a launch).
// https://docs.abconvert.io/headless-sdk/cart
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions } from '@/lib/abconvert';
import { buyerIp, CART_COOKIE, requestCountry } from '@/lib/request';
import { STORE_ATTRIBUTES, getCart, sameAttributes, updateAttributes } from '@/lib/shopify';
import { Price } from '@/components/Price';
import { Exposure } from '@/components/Exposure';

export const dynamic = 'force-dynamic';
export const metadata = { alternates: { canonical: '/cart' }, robots: { index: false } };

export default async function CartPage() {
  const country = await requestCountry();
  const call = { country, buyerIp: await buyerIp() };
  const abconvert = await createABConvert({ ...abconvertOptions, country });
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  let cart = cartId ? await getCart(cartId, call) : null;
  const attributes = [...STORE_ATTRIBUTES, ...abconvert.getCartAttributes()];
  if (cart?.lines.length && !sameAttributes(cart.attributes, attributes)) cart = await updateAttributes(cart.id, attributes, call);

  const offers = abconvert.getOffers();
  const threshold = abconvert.getFreeShippingThreshold();
  const lines = (cart?.lines ?? []).map((line) => {
    const tested = abconvert.getPriceByVariantId(line.variantId);
    return { line, amount: tested?.amount ?? line.price.amount };
  });
  const subtotal = lines.reduce((sum, { line, amount }) => sum + amount * line.quantity, 0);
  const currency = cart?.lines[0]?.price.currency ?? 'USD';

  return (
    <div className="cart">
      <h1>Cart</h1>
      {offers.map((offer) => (
        <div key={offer.experimentId} className="banner">
          {offer.title}
          <Exposure experimentId={offer.experimentId} />
        </div>
      ))}
      {threshold && lines.length ? (
        <div className="banner">
          {subtotal >= threshold.amount ? 'You have free shipping.' : `Add ${abconvert.formatPrice(threshold.amount - subtotal, threshold.currency)} more for free shipping.`}
        </div>
      ) : null}
      {!lines.length ? (
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
          <a className="button primary" href={cart!.checkoutUrl}>Checkout</a>
          <details className="muted">
            <summary>Cart attributes</summary>
            <pre>{JSON.stringify({ cart: cart!.attributes, lines: cart!.lines.map((line) => line.attributes) }, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}
