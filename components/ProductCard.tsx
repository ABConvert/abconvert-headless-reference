import Link from 'next/link';
import type { ABConvert } from '@abconvert/headless';
import type { Product } from '@/lib/shopify';
import { Price } from './Price';

export function ProductGrid({ products, abconvert }: { products: Product[]; abconvert: ABConvert | null }) {
  return (
    <div className="grid">
      {products.map((product) => (
        <div key={product.id} className="card">
          <Link href={`/products/${product.handle}`}>
            {product.image ? <img src={product.image.url} alt={product.image.altText ?? product.title} loading="lazy" /> : <div className="placeholder" />}
            <h3>{product.title}</h3>
          </Link>
          <Price product={product} abconvert={abconvert} />
        </div>
      ))}
    </div>
  );
}
