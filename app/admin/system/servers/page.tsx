import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SystemServersPage() {
	permanentRedirect('/admin/infra/servers');
}