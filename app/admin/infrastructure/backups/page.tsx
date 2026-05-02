import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyInfrastructureBackupsRedirect() {
  redirect('/admin/infra/databases?tab=backups');
}
