'use client';
// The cart page's Checkout: a plain link to Shopify checkout, with a spinner
// while the browser leaves.
import { Spinner, useLeaving } from './Spinner';

export function CheckoutLink({ href }: { href: string }) {
  const [leaving, setLeaving] = useLeaving();
  const onClick = (event: React.MouseEvent) => {
    // A click that opens a new tab leaves this page as it is.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setLeaving(true);
  };
  return (
    <a className="button primary" href={href} aria-busy={leaving} onClick={onClick}>
      {leaving ? <Spinner /> : null}Checkout
    </a>
  );
}
