// The visitor's cart, as the cart page, the cart drawer and the cart actions
// read it: the Shopify cart, plus the ABConvert client built from this request.
//
// Checkout charges what the cart attributes say. So wherever the shopper can
// go to checkout from, the attributes are checked first and written again
// when they no longer match the visitor's tests, for example after a test
// launched since the cart last changed, or after a country switch.
// https://docs.abconvert.io/headless-sdk/cart
import 'server-only';
import { cookies } from 'next/headers';
import { createABConvert, type ServerABConvert } from '@abconvert/headless/next';
import { abconvertOptions, type Country } from './abconvert';
import { buyerIp, CART_COOKIE, requestCountry } from './request';
import { STORE_ATTRIBUTES, addLines, createCart, getCart, sameAttributes, updateAttributes, type Attribute, type Cart } from './shopify';

export interface CartContext {
  country: Country;
  call: { country: Country; buyerIp?: string };
  /** The client from this request: it knows the visitor and prices every product. */
  abconvert: ServerABConvert;
}

export async function cartContext(): Promise<CartContext> {
  const country = await requestCountry();
  const abconvert = await createABConvert({ ...abconvertOptions, country });
  return { country, call: { country, buyerIp: await buyerIp() }, abconvert };
}

/** The store's own cart attributes and ABConvert's, together: Shopify replaces the whole list on each update. */
export const cartAttributes = (abconvert: ServerABConvert): Attribute[] => [...STORE_ATTRIBUTES, ...abconvert.getCartAttributes()];

/** The visitor's cart with attributes that match their tests now, or null when they have none. */
export async function currentCart(context: CartContext): Promise<Cart | null> {
  const cartId = (await cookies()).get(CART_COOKIE)?.value;
  const cart = cartId ? await getCart(cartId, context.call) : null;
  if (!cart?.lines.length) return cart;
  const attributes = cartAttributes(context.abconvert);
  return sameAttributes(cart.attributes, attributes) ? cart : updateAttributes(cart.id, attributes, context.call);
}

/** Adds one of a product variant, creating the cart when there is none. `addedFrom` is the store's own line attribute. */
export async function addToCurrentCart(context: CartContext, variantId: string, addedFrom: string): Promise<Cart> {
  const line = { variantId, quantity: 1, attributes: [{ key: '_added_from', value: addedFrom }, ...context.abconvert.getCartLineAttributes()] };
  const attributes = cartAttributes(context.abconvert);
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  let cart = existing ? await getCart(existing, context.call) : null;
  if (!cart) {
    cart = await createCart({ lines: [line], attributes, country: context.country, buyerIp: context.call.buyerIp });
  } else {
    cart = await addLines(cart.id, [line], context.call);
    if (!sameAttributes(cart.attributes, attributes)) cart = await updateAttributes(cart.id, attributes, context.call);
  }
  // The cart ID carries a secret key: an httpOnly cookie keeps it out of the page.
  jar.set(CART_COOKIE, cart.id, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  return cart;
}
