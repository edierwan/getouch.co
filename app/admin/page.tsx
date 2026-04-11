import { db } from '@/lib/db';
import { users, appProvisions } from '@/lib/schema';
import { count, eq } from 'drizzle-orm';
import PortalDashboard from './dashboard';
import { getServicesWithStatus } from './data';

export default async function AdminPage() {
  const [services, [totalUsers], [pendingUsers], [aiProvisioned]] = await Promise.all([
    getServicesWithStatus(),
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
      services={services}
      lastChecked={new Date().toLocaleString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    />
  );
}
