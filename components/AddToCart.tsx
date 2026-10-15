'use client';
// Add to Cart and Buy Now. Both report the add to cart, then post a server
// action that writes ABConvert's cart attributes. Add to Cart opens the cart
// drawer with what the server returned.
import { useTransition } from 'react';
import { useABConvert } from '@abconvert/headless/react';
import { addToCart, buyNow } from '@/app/actions';
import { useCartDrawer } from './CartDrawer';

export function AddToCart({ productId, variantId }: { productId: string; variantId: string }) {
  const { track } = useABConvert();
  const drawer = useCartDrawer();
  const [pending, start] = useTransition();
  const report = () => track('product_added_to_cart', { productId, variantId, quantity: 1 });
  return (
    <>
      <button type="button" className="button primary" disabled={pending} onClick={() => start(async () => { report(); await buyNow(variantId); })}>
        Buy Now
      </button>
      <button type="button" className="button secondary" disabled={pending} onClick={() => start(async () => { report(); drawer.open(await addToCart(variantId)); })}>
        Add to Cart
      </button>
    </>
  );
}
