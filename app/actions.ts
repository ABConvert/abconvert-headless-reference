'use server';
// The cart actions. Each builds the ABConvert client from the request (no
// page key): the cart needs the visitor, which the middleware passed on.
// https://docs.abconvert.io/headless-sdk/nextjs#step-3-write-the-cart-attributes
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COUNTRY_COOKIE, countryOf } from '@/lib/abconvert';
import { addToCurrentCart, cartAttributes, cartContext, currentCart, storedCart } from '@/lib/cart';
import { CART_COOKIE } from '@/lib/request';
import { createCart, updateCountry, updateQuantity } from '@/lib/shopify';
import { drawerFor, type Drawer } from '@/lib/drawer';

/** The product page's Add to Cart. The page then opens the cart drawer. */
export async function addToCart(variantId: string): Promise<Drawer> {
  try {
    const context = await cartContext();
    const cart = await addToCurrentCart(context, variantId, 'product_page');
    return await drawerFor(cart, context);
  } catch (error) {
    return failed(error);
  }
}

/**
 * Buy Now skips the cart: a new cart with both sets of attributes. The button
 * goes to the checkout URL it returns, or shows the error.
 */
export async function buyNow(variantId: string): Promise<{ url: string } | { error: string }> {
  try {
    const context = await cartContext();
    const cart = await createCart({
      lines: [{ variantId, quantity: 1, attributes: [{ key: '_added_from', value: 'buy_now' }, ...context.abconvert.getCartLineAttributes()] }],
      attributes: cartAttributes(context.abconvert),
      country: context.country,
      buyerIp: context.call.buyerIp,
    });
    return { url: cart.checkoutUrl };
  } catch (error) {
    return { error: message(error) };
  }
}

/** What the cart drawer shows when it opens: the cart, priced on the server. */
export async function openDrawer(): Promise<Drawer> {
  try {
    const context = await cartContext();
    return await drawerFor(await currentCart(context), context);
  } catch (error) {
    return failed(error);
  }
}

/** A recommendation's Add button in the drawer. */
export async function addFromDrawer(variantId: string): Promise<Drawer> {
  try {
    const context = await cartContext();
    return await drawerFor(await addToCurrentCart(context, variantId, 'cart_drawer'), context);
  } catch (error) {
    return failed(error);
  }
}

/** The drawer's quantity buttons; 0 removes the line. */
export async function changeQuantity(lineId: string, quantity: number): Promise<Drawer> {
  try {
    const context = await cartContext();
    const cart = await currentCart(context);
    if (!cart) return await drawerFor(null, context);
    await updateQuantity(cart.id, lineId, quantity, context.call);
    return await drawerFor(await currentCart(context), context);
  } catch (error) {
    return failed(error);
  }
}

/**
 * The drawer's Checkout button. The attributes are checked again at the click,
 * so checkout never charges a price older than the one the drawer showed.
 * On an error the shopper stays in the drawer: checkout would charge the old price.
 */
export async function startCheckout(): Promise<{ url: string } | { error: string }> {
  try {
    const cart = await currentCart(await cartContext());
    return cart?.lines.length ? { url: cart.checkoutUrl } : { error: 'Your cart is empty.' };
  } catch (error) {
    return { error: message(error) };
  }
}

/** The header's country selector. The cart's country moves with it, so checkout charges that market. */
export async function setCountry(form: FormData): Promise<void> {
  const country = countryOf(String(form.get('country')));
  const jar = await cookies();
  jar.set(COUNTRY_COOKIE, country, { path: '/', sameSite: 'lax' });
  // Reuse cart recovery when switching stores leaves a stale cookie behind.
  if (jar.get(CART_COOKIE)?.value) {
    const context = await cartContext();
    const cart = await storedCart(context);
    if (cart) await updateCountry(cart.id, context.call);
    else jar.delete(CART_COOKIE);
  }
  redirect(String(form.get('back') || '/'));
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function failed(error: unknown): Drawer {
  console.error('[cart]', message(error));
  return { lines: [], count: 0, subtotal: '', recommendations: [], offers: [], error: 'The cart could not be updated. Try again.' };
}
