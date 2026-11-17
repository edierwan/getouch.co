import { DatabasesClient } from './DatabasesClient';
import { getPreprodBackupOverview } from '@/lib/preprod-backups';
import { getPlatformServicesSnapshot } from '@/lib/platform-services';
import { getDatabaseProbes } from '@/lib/database-probes';
import { getSupabaseStackHealth } from '@/lib/supabase-stack-health';
import { SUPABASE_HEALTH_TARGETS } from './supabase-stacks';

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
  const [platform, probes, supabaseHealth] = await Promise.all([
    getPlatformServicesSnapshot(),
    getDatabaseProbes(),
    getSupabaseStackHealth(SUPABASE_HEALTH_TARGETS),
  ]);

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
      probes={probes}
      supabaseHealth={supabaseHealth}
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
