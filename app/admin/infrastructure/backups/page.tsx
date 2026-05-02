import { renderDatabasesPage } from '../../databases/page';

export const dynamic = 'force-dynamic';

export default async function InfrastructureBackupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  return renderDatabasesPage({
    searchParams,
    breadcrumbPage: 'Backups',
    title: 'Backups',
    subtitle: 'Preprod backup controls, restore queueing, and retention visibility for platform data stores.',
    showDataStores: false,
  });
}