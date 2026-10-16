'use client';
// The cart drawer. It opens from the header and after Add to Cart, on any page.
//
// Three rules keep it consistent with checkout:
// 1. Every price in it comes from the server (`lib/drawer.ts`), never from the
//    browser's copy of the page, which may not hold that product's test.
// 2. Checkout goes through `startCheckout`, which checks the cart attributes at
//    the click, so checkout charges the price the drawer showed.
// 3. Each add from the drawer writes the line attributes on the server and
//    tracks the add to cart, as the product page does.
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useState, useTransition } from 'react';
import { useABConvert } from '@abconvert/headless/react';
import { addFromDrawer, changeQuantity, openDrawer, startCheckout } from '@/app/actions';
import type { Drawer } from '@/lib/drawer';
import { Exposure } from './Exposure';
import { Spinner, useLeaving } from './Spinner';

interface DrawerControls {
  /** Opens the drawer, with contents an action already returned, or loads them. */
  open(contents?: Drawer): void;
}
const DrawerContext = createContext<DrawerControls>({ open: () => {} });
export const useCartDrawer = () => useContext(DrawerContext);

export function CartDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [pending, start] = useTransition();
  const [leaving, setLeaving] = useLeaving();
  // The button the shopper clicked last: only it spins, while every button waits.
  const [clicked, setClicked] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const { track } = useABConvert();
  const busy = pending || leaving;
  const spinning = (button: string) => busy && clicked === button;
  const run = (button: string, action: () => Promise<void>) => {
    setClicked(button);
    start(action);
  };

  const open = useCallback((contents?: Drawer) => {
    setOpen(true);
    setCheckoutError('');
    if (contents) setDrawer(contents);
    else run('open', async () => setDrawer(await openDrawer()));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const checkout = () =>
    run('checkout', async () => {
      const result = await startCheckout();
      if ('url' in result) {
        setLeaving(true);
        window.location.assign(result.url);
      } else setCheckoutError(result.error);
    });

  // Exposures for the test prices on screen, once the drawer shows them.
  const shown = isOpen && drawer ? [...drawer.lines, ...drawer.recommendations].flatMap((item) => (item.experimentId ? [item.experimentId] : [])) : [];
  const exposures = [...new Set([...shown, ...(isOpen && drawer ? drawer.offers.map((offer) => offer.experimentId) : [])])];

  return (
    <DrawerContext.Provider value={{ open }}>
      {children}
      {isOpen ? (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="drawer" role="dialog" aria-label="Shopping cart" aria-busy={busy} onClick={(event) => event.stopPropagation()}>
            <header className="drawer-head">
              <h2>Shopping Cart{drawer && spinning('open') ? <Spinner /> : null}</h2>
              <button type="button" className="icon" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </header>
            {exposures.map((id) => <Exposure key={id} experimentId={id} />)}
            {!drawer ? (
              <p className="muted drawer-body loading"><Spinner />Loading…</p>
            ) : (
              <div className="drawer-body">
                {drawer.error ? <p className="error">{drawer.error}</p> : null}
                {drawer.offers.map((offer) => <div key={offer.experimentId} className="banner">{offer.title}</div>)}
                {!drawer.lines.length ? (
                  <p>Your cart is empty.</p>
                ) : (
                  <ul className="drawer-lines">
                    {drawer.lines.map((line) => (
                      <li key={line.id}>
                        {line.image ? <img src={line.image} alt="" /> : <div className="placeholder" />}
                        <div>
                          <Link href={`/products/${line.handle}`} onClick={() => setOpen(false)}>{line.title}</Link>
                          <div className="qty">
                            <button type="button" aria-label="Decrease quantity" disabled={busy} aria-busy={spinning(`less:${line.id}`)} onClick={() => run(`less:${line.id}`, async () => setDrawer(await changeQuantity(line.id, line.quantity - 1)))}>{spinning(`less:${line.id}`) ? <Spinner /> : '−'}</button>
                            <span>{line.quantity}</span>
                            <button type="button" aria-label="Increase quantity" disabled={busy} aria-busy={spinning(`more:${line.id}`)} onClick={() => run(`more:${line.id}`, async () => setDrawer(await changeQuantity(line.id, line.quantity + 1)))}>{spinning(`more:${line.id}`) ? <Spinner /> : '+'}</button>
                            <button type="button" className="link" disabled={busy} aria-busy={spinning(`remove:${line.id}`)} onClick={() => run(`remove:${line.id}`, async () => setDrawer(await changeQuantity(line.id, 0)))}>{spinning(`remove:${line.id}`) ? <Spinner /> : null}Remove</button>
                          </div>
                        </div>
                        <span className="price">{line.amount}{line.compareAt ? <s className="compare">{line.compareAt}</s> : null}{line.each ? <span className="each">{line.each} each</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {drawer.recommendations.length ? (
                  <>
                    <h3>You may also like</h3>
                    <ul className="drawer-recs">
                      {drawer.recommendations.map((product) => (
                        <li key={product.productId}>
                          {product.image ? <img src={product.image} alt="" /> : <div className="placeholder" />}
                          <div>
                            <Link href={`/products/${product.handle}`} onClick={() => setOpen(false)}>{product.title}</Link>
                            <span className="price">{product.amount}{product.compareAt ? <s className="compare">{product.compareAt}</s> : null}</span>
                          </div>
                          <button
                            type="button"
                            aria-label={`Add ${product.title} to cart`}
                            disabled={busy}
                            aria-busy={spinning(`add:${product.variantId}`)}
                            onClick={() =>
                              run(`add:${product.variantId}`, async () => {
                                const contents = await addFromDrawer(product.variantId);
                                // Track only a line that was added
                                if (!contents.error) track('product_added_to_cart', { productId: product.productId, variantId: product.variantId, quantity: 1 });
                                setDrawer(contents);
                              })
                            }
                          >
                            {spinning(`add:${product.variantId}`) ? <Spinner /> : null}Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            )}
            {drawer?.lines.length ? (
              <footer className="drawer-foot">
                <p>Subtotal ({drawer.count} {drawer.count === 1 ? 'item' : 'items'}) <strong>{drawer.subtotal}</strong></p>
                {checkoutError ? <p className="error">{checkoutError}</p> : null}
                <button type="button" className="button primary" disabled={busy} aria-busy={spinning('checkout')} onClick={checkout}>{spinning('checkout') ? <Spinner /> : null}Checkout</button>
                <Link href="/cart" className="button secondary" onClick={() => setOpen(false)}>View Cart</Link>
              </footer>
            ) : null}
          </aside>
        </div>
      ) : null}
    </DrawerContext.Provider>
  );
}

/** The header's cart button: opens the drawer. */
export function CartButton() {
  const { open } = useCartDrawer();
  return <button type="button" className="link" onClick={() => open()}>Cart</button>;
}
