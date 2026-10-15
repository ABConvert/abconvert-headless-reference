// The home page, rendered per request so it can price for the visitor's
// country and test groups.
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
