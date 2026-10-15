'use client';
// Add to Cart and Buy Now. Both report the add to cart, then post a server
// action that writes ABConvert's cart attributes. Add to Cart opens the cart
// drawer with what the server returned; Buy Now goes to checkout.
import { useState, useTransition } from 'react';
import { useABConvert } from '@abconvert/headless/react';
import { addToCart, buyNow } from '@/app/actions';
import { useCartDrawer } from './CartDrawer';
import { Spinner, useLeaving } from './Spinner';

type Clicked = 'buy' | 'add' | null;

export function AddToCart({ productId, variantId }: { productId: string; variantId: string }) {
  const { track } = useABConvert();
  const drawer = useCartDrawer();
  const [pending, start] = useTransition();
  const [leaving, setLeaving] = useLeaving();
  const [clicked, setClicked] = useState<Clicked>(null);
  const [error, setError] = useState('');
  const busy = pending || leaving;
  const spinning = (button: Clicked) => busy && clicked === button;

  const run = (button: Clicked, action: () => Promise<void>) => {
    setClicked(button);
    setError('');
    track('product_added_to_cart', { productId, variantId, quantity: 1 });
    start(action);
  };
  const buy = () =>
    run('buy', async () => {
      const result = await buyNow(variantId);
      if ('url' in result) {
        setLeaving(true);
        window.location.assign(result.url);
      } else setError(result.error);
    });
  const add = () => run('add', async () => drawer.open(await addToCart(variantId)));

  return (
    <>
      <button type="button" className="button primary" disabled={busy} aria-busy={spinning('buy')} onClick={buy}>
        {spinning('buy') ? <Spinner /> : null}Buy Now
      </button>
      <button type="button" className="button secondary" disabled={busy} aria-busy={spinning('add')} onClick={add}>
        {spinning('add') ? <Spinner /> : null}Add to Cart
      </button>
      {error ? <p className="error">{error}</p> : null}
    </>
  );
}
