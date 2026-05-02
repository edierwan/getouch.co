import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ServersPage() {
  permanentRedirect('/admin/infra/databases');
}
