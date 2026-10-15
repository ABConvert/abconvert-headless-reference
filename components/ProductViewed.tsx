'use client';
// A product page reports its product once it is on screen. Per-product results
// and product group results read it.
import { useEffect } from 'react';
import { useABConvert } from '@abconvert/headless/react';

export function ProductViewed({ productId, variantId }: { productId: string; variantId: string }) {
  const { track } = useABConvert();
  useEffect(() => {
    track('product_viewed', { productId, variantId });
  }, [productId, variantId, track]);
  return null;
}
