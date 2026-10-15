// A product page a test changes: one cached copy per page key. The client
// rebuilds the key's test groups and prices from the key alone.
import { notFound } from 'next/navigation';
import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions, countryOf } from '@/lib/abconvert';
import { getProduct } from '@/lib/shopify';
import { ProductView, productMetadata } from '@/components/ProductView';

export const revalidate = 60;
export const generateStaticParams = () => [];

type Params = { params: Promise<{ pageKey: string; handle: string }> };

export async function generateMetadata({ params }: Params) {
  // Built from the route, never from the rewritten path: a direct visit to /abconvert/... redirects.
  return productMetadata((await params).handle);
}

export default async function TestedProductPage({ params }: Params) {
  const { pageKey, handle } = await params;
  const abconvert = await createABConvert({ ...abconvertOptions, pageKey });
  const country = countryOf(abconvert.getCountry());
  const product = await getProduct(handle, country);
  if (!product) notFound();
  return <ProductView product={product} country={country} abconvert={abconvert} />;
}
