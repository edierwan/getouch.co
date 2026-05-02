import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyAdminInfraBackupsRedirect() {
  redirect('/admin/infra/databases?tab=backups');
}
