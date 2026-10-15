// On-demand revalidation of a product page, for example from Shopify's
// `products/update` webhook through your own backend.
//
// A tested product page has copies under the page key route as well as the
// usual route, and `revalidatePath('/products/x')` refreshes the usual route
// only. The page key copies cannot be named one by one, since the keys are
// not known in advance, so the second call revalidates every page key copy of
// every product page; each renders again only when a visitor next opens it.
//
//   curl -X POST http://localhost:3000/api/revalidate \
//     -H "x-revalidate-secret: $REVALIDATE_SECRET" \
//     -H "content-type: application/json" -d '{"handle":"the-collection-snowboard-hydrogen"}'
import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get('x-revalidate-secret') !== secret) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  const { handle } = (await request.json().catch(() => ({}))) as { handle?: string };
  if (!handle || !/^[a-z0-9-]+$/i.test(handle)) return NextResponse.json({ error: 'A product handle is required' }, { status: 400 });

  // The usual route, under the locale segment the middleware rewrites to.
  revalidatePath(`/en/products/${handle}`);
  // Every page key copy of every product page.
  revalidatePath('/[locale]/abconvert/[pageKey]/products/[handle]', 'page');
  return NextResponse.json({ revalidated: true, handle, at: new Date().toISOString() });
}
