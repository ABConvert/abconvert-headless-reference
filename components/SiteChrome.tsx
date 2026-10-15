// Header, category bar and footer, plus what every page needs: page view
// tracking, the cart drawer and, in development, the ABConvert panel.
import Link from 'next/link';
import { getCollections, STORE_LABEL } from '@/lib/shopify';
import { CountrySelector } from './CountrySelector';
import { Tracking } from './Tracking';
import { DebugPanel } from './DebugPanel';
import { CartButton, CartDrawerProvider } from './CartDrawer';

const SHOW_PANEL = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ABCONVERT_DEBUG === '1';

export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const collections = await getCollections();
  return (
    <CartDrawerProvider>
      <Tracking />
      <header className="site">
        <div className="bar">
          <Link href="/" className="logo">Reference Store</Link>
          <form className="search" action="/search" method="get">
            <input name="q" placeholder="Search tools and hardware" aria-label="Search" />
            <button type="submit">Search</button>
          </form>
          <CountrySelector />
          <CartButton />
        </div>
        <nav className="cats">
          {collections.map((collection) => <Link key={collection.handle} href={`/collections/${collection.handle}`}>{collection.title}</Link>)}
        </nav>
      </header>
      <main className="page">{children}</main>
      <footer className="site">Catalog: {STORE_LABEL}. A reference store, not a real shop.</footer>
      {SHOW_PANEL ? <DebugPanel /> : null}
    </CartDrawerProvider>
  );
}
