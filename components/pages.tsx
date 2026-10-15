// Page bodies shared by the usual routes and the page key routes.
import Link from 'next/link';
import type { ABConvert } from '@abconvert/headless';
import type { Country } from '@/lib/abconvert';
import { getCollection, getCollections, getFeatured, searchProducts } from '@/lib/shopify';
import { ProductGrid } from './ProductCard';

interface PageProps { abconvert: ABConvert | null; country: Country }

export async function HomePage({ abconvert, country }: PageProps) {
  const [products, collections] = await Promise.all([getFeatured(country), getCollections()]);
  return (
    <>
      <section className="hero">
        <h1>Tools and hardware for every job</h1>
        <p>A reference storefront for ABConvert tests on Next.js.</p>
      </section>
      <h2>Best sellers</h2>
      <ProductGrid products={products} abconvert={abconvert} />
      <h2>Shop by category</h2>
      <ul>
        {collections.map((collection) => <li key={collection.handle}><Link href={`/collections/${collection.handle}`}>{collection.title}</Link></li>)}
      </ul>
    </>
  );
}

export async function CollectionPage({ handle, abconvert, country }: PageProps & { handle: string }) {
  const found = await getCollection(handle, country);
  if (!found) return null;
  return (
    <>
      <h1>{found.collection.title}</h1>
      <ProductGrid products={found.products} abconvert={abconvert} />
    </>
  );
}

export async function SearchPage({ query, abconvert, country }: PageProps & { query: string }) {
  const products = await searchProducts(query, country);
  return (
    <>
      <h1>Search results for &ldquo;{query}&rdquo;</h1>
      {products.length ? <ProductGrid products={products} abconvert={abconvert} /> : <p>No products found.</p>}
    </>
  );
}
