'use client';
// Writes the country cookie, so the middleware prices the next page for that
// country. Reads the cookie after mount: a cached page cannot know it.
import { useEffect, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { setCountry } from '@/app/actions';
import { Spinner } from './Spinner';
import { COUNTRIES, COUNTRY_COOKIE, countryOf, type Country } from '@/lib/abconvert';

const LABELS: Record<Country, string> = { US: 'United States (USD)', CA: 'Canada (CAD)' };

export function CountrySelector() {
  const pathname = usePathname();
  const [country, setCurrent] = useState<Country>('US');
  const [pending, start] = useTransition();
  useEffect(() => {
    const match = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COUNTRY_COOKIE}=`));
    setCurrent(countryOf(match?.slice(COUNTRY_COOKIE.length + 1)));
  }, []);
  return (
    <form action={setCountry} className="country" aria-busy={pending}>
      <input type="hidden" name="back" value={pathname} />
      <select
        name="country"
        aria-label="Country"
        value={country}
        disabled={pending}
        onChange={(event) => {
          setCurrent(countryOf(event.target.value));
          const form = event.currentTarget.form;
          if (form) {
            const data = new FormData(form);
            start(() => setCountry(data));
          }
        }}
      >
        {COUNTRIES.map((code) => <option key={code} value={code}>{LABELS[code]}</option>)}
      </select>
      {pending ? <Spinner /> : null}
    </form>
  );
}
