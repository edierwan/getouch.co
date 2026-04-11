import { db } from '@/lib/db';
import { users, appProvisions } from '@/lib/schema';
import { count, eq } from 'drizzle-orm';
import PortalDashboard from './dashboard';

export default async function AdminPage() {
  const [[totalUsers], [pendingUsers], [aiProvisioned]] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(eq(users.role, 'pending')),
    db.select({ value: count() }).from(appProvisions).where(eq(appProvisions.app, 'open_webui')),
  ]);

  return (
    <PortalDashboard
      stats={{
        users: totalUsers.value,
        pending: pendingUsers.value,
        aiProvisioned: aiProvisioned.value,
      }}
    />
  );
}
