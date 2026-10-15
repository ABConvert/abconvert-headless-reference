import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reference Store',
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
};

// <html> and <body> only. Each route group renders its own ABConvert provider,
// so each page has exactly one.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
