import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AdminLayout() {
  const session = await getSession();
  if (!session) redirect('/auth/login');
  if (session.role !== 'admin') redirect('/portal');

  redirect(process.env.PORTAL_ADMIN_URL || 'https://portal.getouch.co');
}
