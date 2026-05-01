import { DatabasesClient } from './DatabasesClient';
import { getPreprodBackupOverview } from '@/lib/preprod-backups';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';

export const dynamic = 'force-dynamic';

type DatabasesPageSearchParams = Promise<{ notice?: string; error?: string }>;

type DatabasesPageOptions = {
  searchParams?: DatabasesPageSearchParams;
  breadcrumbPage?: string;
  title?: string;
  subtitle?: string;
};

export async function renderDatabasesPage({
  searchParams,
  breadcrumbPage = 'Databases',
  title = 'Databases & Backups',
  subtitle = 'Core platform databases, AI observability data stores, and preprod backup controls.',
}: DatabasesPageOptions = {}) {
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
      breadcrumbPage={breadcrumbPage}
      title={title}
      subtitle={subtitle}
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