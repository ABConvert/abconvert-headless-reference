'use client';
// Writes the country cookie, so the middleware prices the next page for that
// country. Reads the cookie after mount: a cached page cannot know it.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { setCountry } from '@/app/actions';
import { COUNTRIES, COUNTRY_COOKIE, countryOf, type Country } from '@/lib/abconvert';

const LABELS: Record<Country, string> = { US: 'United States (USD)', CA: 'Canada (CAD)' };

export function CountrySelector() {
  const pathname = usePathname();
  const [country, setCurrent] = useState<Country>('US');
  useEffect(() => {
    const match = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COUNTRY_COOKIE}=`));
    setCurrent(countryOf(match?.slice(COUNTRY_COOKIE.length + 1)));
  }, []);
  return (
    <form action={setCountry}>
      <input type="hidden" name="back" value={pathname} />
      <select name="country" aria-label="Country" value={country} onChange={(event) => { setCurrent(countryOf(event.target.value)); event.currentTarget.form?.requestSubmit(); }}>
        {COUNTRIES.map((code) => <option key={code} value={code}>{LABELS[code]}</option>)}
      </select>
    </form>
  );
}
