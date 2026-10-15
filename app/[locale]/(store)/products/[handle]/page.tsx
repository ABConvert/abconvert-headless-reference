// A product page no test changes: one cached copy for everyone, as without
// ABConvert. Your own country handling applies here; the SDK keys only the
// pages a test changes by country.
import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/shopify';
import { ProductView, productMetadata } from '@/components/ProductView';

export const revalidate = 60;
// Render each product on its first request, then cache it.
export const generateStaticParams = () => [];

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params) {
  return productMetadata((await params).handle);
}

export default async function ProductPage({ params }: Params) {
  const product = await getProduct((await params).handle, 'US');
  if (!product) notFound();
  return <ProductView product={product} country="US" abconvert={null} />;
}
