import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions, countryOf } from '@/lib/abconvert';
import { SearchPage } from '@/components/pages';

export default async function TestedSearch({ params, searchParams }: { params: Promise<{ pageKey: string }>; searchParams: Promise<{ q?: string }> }) {
  const abconvert = await createABConvert({ ...abconvertOptions, pageKey: (await params).pageKey });
  return <SearchPage query={(await searchParams).q ?? ''} abconvert={abconvert} country={countryOf(abconvert.getCountry())} />;
}
