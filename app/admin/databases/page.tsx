import { DatabasesClient } from './DatabasesClient';
import { getPreprodBackupOverview } from '@/lib/preprod-backups';

export default async function DatabasesPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};

  let overview = null;
  let overviewError = '';

  try {
    overview = await getPreprodBackupOverview();
  } catch (error) {
    overviewError = error instanceof Error ? error.message : 'Failed to read preprod backup state.';
  }

  return <DatabasesClient initialOverview={overview} initialNotice={resolvedSearchParams.notice} initialError={resolvedSearchParams.error || overviewError} />;
}