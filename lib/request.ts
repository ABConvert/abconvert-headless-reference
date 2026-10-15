// What a per-request render or a server action reads about the shopper.
import 'server-only';
import { cookies, headers } from 'next/headers';
import { COUNTRY_COOKIE, countryOf, type Country } from './abconvert';

export async function requestCountry(): Promise<Country> {
  return countryOf((await cookies()).get(COUNTRY_COOKIE)?.value);
}

/**
 * The shopper's IP for `Shopify-Storefront-Buyer-IP`. Behind Google Cloud Load
 * Balancing the client IP is the first entry of `X-Forwarded-For`; check what
 * your own proxies add before trusting it.
 */
export async function buyerIp(): Promise<string | undefined> {
  const forwarded = (await headers()).get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || undefined;
}

export const CART_COOKIE = 'cart';
