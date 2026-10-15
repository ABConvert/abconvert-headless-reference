// Pages no test changes for this visitor. The provider gets the empty page
// key, so the browser still tracks the visitor's tests on these pages.
import { ABConvertProvider } from '@abconvert/headless/react';
import { createABConvert } from '@abconvert/headless/next';
import { abconvertOptions } from '@/lib/abconvert';
import { SiteChrome } from '@/components/SiteChrome';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  // Reads no request, so the pages under this layout stay static.
  const abconvert = await createABConvert({ ...abconvertOptions, pageKey: '' });
  return (
    <ABConvertProvider pageState={abconvert.getPageState()}>
      <SiteChrome>{children}</SiteChrome>
    </ABConvertProvider>
  );
}
