'use client';
// A button that skips the cart: a cart permalink with the visitor's test
// groups. Built in the browser after mount, where the client knows the
// visitor; never cache or share the URL.
// https://docs.abconvert.io/headless-sdk/cart
import { useEffect, useState } from 'react';
import { useABConvert } from '@abconvert/headless/react';

export function ShopPayLink({ variantId }: { variantId: string }) {
  const abconvert = useABConvert();
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    try {
      setHref(abconvert.getCheckoutUrl({ lines: [{ variantId, quantity: 1 }], payment: 'shop_pay' }));
    } catch {
      // No shop configured, or the visitor is not known yet.
      setHref(null);
    }
  }, [abconvert, variantId]);
  return href ? <a className="button shop-pay" href={href}>Buy with Shop Pay</a> : null;
}
