import { SearchPage } from '@/components/pages';

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <SearchPage query={(await searchParams).q ?? ''} abconvert={null} country="US" />;
}
