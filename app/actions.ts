'use server';
// The cart actions. Each creates the ABConvert client without `pageKey`: the
// cart needs the visitor, which the middleware passed on with the request.
// The store's own attributes are kept, and ABConvert's are added next to them.
// https://docs.abconvert.io/headless-sdk/nextjs#step-5-write-the-cart-attributes
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions, COUNTRY_COOKIE, countryOf } from '@/lib/abconvert';
import { buyerIp, CART_COOKIE, requestCountry } from '@/lib/request';
import { STORE_ATTRIBUTES, addLines, createCart, getCart, updateAttributes, updateCountry, type Attribute } from '@/lib/shopify';

const STORE_LINE_ATTRIBUTES: Attribute[] = [{ key: '_added_from', value: 'product_page' }];

async function context() {
  const country = await requestCountry();
  const abconvert = await createABConvert({ ...abconvertOptions, country });
  return { country, ip: await buyerIp(), abconvert };
}

export async function addToCart(variantId: string): Promise<void> {
  const { country, ip, abconvert } = await context();
  const line = { variantId, quantity: 1, attributes: [...STORE_LINE_ATTRIBUTES, ...abconvert.getCartLineAttributes()] };
  const attributes = [...STORE_ATTRIBUTES, ...abconvert.getCartAttributes()];
  const call = { country, buyerIp: ip };

  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  let cart = existing ? await getCart(existing, call) : null;
  if (!cart) {
    cart = await createCart({ lines: [line], attributes, country, buyerIp: ip });
  } else {
    cart = await addLines(cart.id, [line], call);
    // Again on every change: a cart made before a test launched has no attributes for it.
    cart = await updateAttributes(cart.id, attributes, call);
  }
  // The cart ID carries a secret key: an httpOnly cookie keeps it out of the page.
  jar.set(CART_COOKIE, cart.id, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  redirect('/cart');
}

/** Buy Now skips the cart page: a new cart with both sets of attributes, straight to checkout. */
export async function buyNow(variantId: string): Promise<void> {
  const { country, ip, abconvert } = await context();
  const cart = await createCart({
    lines: [{ variantId, quantity: 1, attributes: [...STORE_LINE_ATTRIBUTES, ...abconvert.getCartLineAttributes()] }],
    attributes: [...STORE_ATTRIBUTES, ...abconvert.getCartAttributes()],
    country,
    buyerIp: ip,
  });
  redirect(cart.checkoutUrl);
}

/** The header's country selector. The cart's country moves with it, so checkout charges that market. */
export async function setCountry(form: FormData): Promise<void> {
  const country = countryOf(String(form.get('country')));
  const jar = await cookies();
  jar.set(COUNTRY_COOKIE, country, { path: '/', sameSite: 'lax' });
  const cartId = jar.get(CART_COOKIE)?.value;
  if (cartId) await updateCountry(cartId, { country, buyerIp: await buyerIp() });
  redirect(String(form.get('back') || '/'));
}
