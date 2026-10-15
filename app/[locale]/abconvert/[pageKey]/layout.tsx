// Pages a test changes. The middleware rewrote the request here, to a path that
// names the visitor's test groups (the page key). The client is built from
// that key, never from the request, so Next.js keeps one cached copy per key.
// https://docs.abconvert.io/headless-sdk/nextjs#step-3-add-the-page-key-routes
import { ABConvertProvider } from '@abconvert/headless/react';
import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions } from '@/lib/abconvert';
import { SiteChrome } from '@/components/SiteChrome';

export default async function PageKeyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ pageKey: string }> }) {
  const { pageKey } = await params;
  const abconvert = await createABConvert({ ...abconvertOptions, pageKey });
  return (
    <ABConvertProvider pageState={abconvert.getPageState()}>
      <SiteChrome>{children}</SiteChrome>
    </ABConvertProvider>
  );
}
