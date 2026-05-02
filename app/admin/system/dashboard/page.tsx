import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SystemDashboardPage() {
	permanentRedirect('/admin/infra/databases');
}