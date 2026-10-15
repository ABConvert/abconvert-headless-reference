import { notFound } from 'next/navigation';
import { CollectionPage } from '@/components/pages';

export const revalidate = 60;
export const generateStaticParams = () => [];

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params) {
  return { alternates: { canonical: `/collections/${(await params).handle}` } };
}

export default async function Collection({ params }: Params) {
  const page = await CollectionPage({ handle: (await params).handle, abconvert: null, country: 'US' });
  return page ?? notFound();
}
