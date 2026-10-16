// The store's own middleware, with ABConvert's plan merged into it.
//
// Every page renders under a locale segment that the visitor never sees, a
// common setup for a store that adds languages later: `/products/x` renders `app/[locale]/products/x`, and a request
// that names `/en` itself is sent to the clean URL. `planMiddleware` decides
// the visitor's test groups, and says how to redirect, rewrite and cache the
// request; this file applies that next to its own locale rewrite.
// https://docs.abconvert.io/headless-sdk/nextjs#step-1-install-the-package-and-add-the-middleware
import { NextResponse, type NextRequest } from 'next/server';
import { planMiddleware } from '@abconvert/headless/next';
import { abconvertOptions, COUNTRY_COOKIE, countryOf } from './lib/abconvert';

const LOCALE = 'en';

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === `/${LOCALE}` || pathname.startsWith(`/${LOCALE}/`)) {
    return NextResponse.redirect(new URL(`${pathname.slice(LOCALE.length + 1) || '/'}${search}`, request.url), 302);
  }

  // The country prices tested pages: it goes into the page key.
  const country = countryOf(request.cookies.get(COUNTRY_COOKIE)?.value);
  // Null for a request that is not a page, such as an image.
  const plan = await planMiddleware(request, { ...abconvertOptions, country });

  let response: NextResponse;
  if (plan?.redirect) {
    // A URL redirect test sent this visitor elsewhere.
    response = NextResponse.redirect(plan.redirect, plan.redirectStatus);
  } else {
    // The page key path when a test changes this page for the visitor, else the path as requested.
    const path = plan?.rewritePath ?? `${pathname}${search}`;
    response = NextResponse.rewrite(new URL(`/${LOCALE}${path}`, request.url), {
      request: { headers: plan?.requestHeaders ?? request.headers },
    });
  }
  for (const cookie of plan?.setCookies ?? []) response.headers.append('set-cookie', cookie);
  // `cache-control: private` on every response a path-keyed CDN must not keep.
  for (const [name, value] of Object.entries(plan?.responseHeaders ?? {})) response.headers.set(name, value);
  return response;
}

// Non-page routes stay out: a route handler or a webhook carries no browser
// headers, so the SDK would take it for a page load and set cookies on it.
export const config = { matcher: ['/((?!_next/|api/|favicon.ico|robots.txt|sitemap.xml).*)'] };
