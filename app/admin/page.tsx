import { db } from '@/lib/db';
import { users, appProvisions } from '@/lib/schema';
import { getSession } from '@/lib/auth';
import { count, eq, desc } from 'drizzle-orm';
import Dashboard from './dashboard';

export default async function AdminPage() {
  const session = await getSession();

  const [[total], [active], [pending], [_admins], [provisioned]] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(eq(users.role, 'user')),
    db.select({ value: count() }).from(users).where(eq(users.role, 'pending')),
    db.select({ value: count() }).from(users).where(eq(users.role, 'admin')),
    db.select({ value: count() }).from(appProvisions).where(eq(appProvisions.app, 'open_webui')),
  ]);

  const recentUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(5);

  return (
    <Dashboard
      sessionName={session?.name ?? null}
      stats={{ total: total.value, active: active.value, pending: pending.value, provisioned: provisioned.value }}
      recentUsers={recentUsers}
    />
  );
}
