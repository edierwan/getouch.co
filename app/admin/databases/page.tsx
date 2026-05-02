import { DatabasesClient } from './DatabasesClient';
import { getPreprodBackupOverview } from '@/lib/preprod-backups';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';

export const dynamic = 'force-dynamic';

type DatabasesPageSearchParams = Promise<{
  notice?: string;
  error?: string;
  tab?: string;
}>;

export async function renderDatabasesPage({
  searchParams,
}: {
  searchParams?: DatabasesPageSearchParams;
} = {}) {
  const resolvedSearchParams = (await searchParams) || {};

  let overview = null;
  let overviewError = '';
  const platform = await getPlatformServicesSnapshot();

  try {
    overview = await getPreprodBackupOverview();
  } catch (error) {
    overviewError = error instanceof Error ? error.message : 'Failed to read preprod backup state.';
  }

  return (
    <DatabasesClient
      initialOverview={overview}
      initialNotice={resolvedSearchParams.notice}
      initialError={resolvedSearchParams.error || overviewError}
      platform={platform}
    />
  );
}

export default async function DatabasesPage({
  searchParams,
}: {
  searchParams?: DatabasesPageSearchParams;
}) {
  return renderDatabasesPage({ searchParams });
}
