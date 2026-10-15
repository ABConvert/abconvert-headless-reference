'use client';
// Feedback for the buttons that wait on the server: Add to Cart, Buy Now, the
// cart drawer, Checkout and the country switch. Each one calls Shopify through
// a server action, which can take a second or two.
import { useEffect, useState } from 'react';

/** Shown inside the button the shopper clicked, next to its label. */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/**
 * True from a click that leaves for Shopify checkout until the page is gone.
 * Back from checkout can restore this page from the browser's memory as it
 * was, spinner included, so it resets when the page is shown again.
 */
export function useLeaving() {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => event.persisted && setLeaving(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return [leaving, setLeaving] as const;
}
