import { notFound } from 'next/navigation';
import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions, countryOf } from '@/lib/abconvert';
import { CollectionPage } from '@/components/pages';

export const revalidate = 60;
export const generateStaticParams = () => [];

type Params = { params: Promise<{ pageKey: string; handle: string }> };

export async function generateMetadata({ params }: Params) {
  return { alternates: { canonical: `/collections/${(await params).handle}` } };
}

export default async function TestedCollection({ params }: Params) {
  const { pageKey, handle } = await params;
  const abconvert = await createABConvert({ ...abconvertOptions, pageKey });
  const page = await CollectionPage({ handle, abconvert, country: countryOf(abconvert.getCountry()) });
  return page ?? notFound();
}
