// The home page under a page key. It renders per request either way, so it
// reads the visitor from the request, as on the usual route.
import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions } from '@/lib/abconvert';
import { requestCountry } from '@/lib/request';
import { HomePage } from '@/components/pages';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const country = await requestCountry();
  const abconvert = await createABConvert({ ...abconvertOptions, country });
  return <HomePage abconvert={abconvert} country={country} />;
}
