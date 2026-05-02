import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyAdminInfraObjectStorageRedirect() {
  redirect('/admin/infra/databases?tab=storage');
}
