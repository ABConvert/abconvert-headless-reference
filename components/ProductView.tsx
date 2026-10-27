// The product page body, shared by the usual route and the page key route:
// one component, two callers. With a client it shows the test price; without
// one, the Storefront API price.
import type { Metadata } from 'next';
import type { ABConvert } from '@abconvert/headless';
import type { Country } from '@/lib/abconvert';
import type { Product } from '@/lib/shopify';
import { Price } from './Price';
import { AddToCart } from './AddToCart';
import { ProductViewed } from './ProductViewed';
import { ShopPayLink } from './ShopPayLink';

/** Canonical URLs come from the route params, never from the rewritten path. */
export function productMetadata(handle: string): Metadata {
  return { alternates: { canonical: `/products/${handle}` } };
}

export function ProductView({ product, abconvert }: { product: Product; country: Country; abconvert: ABConvert | null }) {
  return (
    <div className="pdp">
      {product.image ? <img src={product.image.url} alt={product.image.altText ?? product.title} /> : <div className="placeholder" />}
      <div>
        <h1>{product.title}</h1>
        <ProductViewed productId={product.id} variantId={product.variantId} />
        <p className="pdp-price"><Price product={product} abconvert={abconvert} /></p>
        <p>{product.description}</p>
        <div className="buttons">
          <AddToCart productId={product.id} variantId={product.variantId} />
          <ShopPayLink variantId={product.variantId} />
        </div>
      </div>
    </div>
  );
}
