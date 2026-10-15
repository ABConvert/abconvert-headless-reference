'use client';
// Next.js has no storefront events, so the store reports page views itself,
// on every navigation. A page view also keeps the visitor's session alive, and
// the SDK sends click-through, scroll and time on page from it.
// Keyed on the path only: useSearchParams() would make a cached page dynamic.
// https://docs.abconvert.io/headless-sdk/tracking#page-views-and-add-to-cart
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useABConvert } from '@abconvert/headless/react';

export function Tracking() {
  const { track } = useABConvert();
  const pathname = usePathname();
  useEffect(() => {
    track('page_viewed');
  }, [pathname, track]);
  return null;
}
