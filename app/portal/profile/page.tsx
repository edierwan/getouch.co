import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  const [userRecord] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      emailVerified: users.emailVerified,
      role: users.role,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!userRecord) redirect('/auth/login');

  return (
    <main className="portal-main">
      <div className="portal-container">
        <div className="portal-hero" style={{ marginBottom: '2rem' }}>
          <div className="portal-hero-text">
            <div className="portal-hero-tag">Account</div>
            <h1 className="portal-greeting">My Profile</h1>
            <p className="portal-sub">Manage your personal information and verification.</p>
          </div>
        </div>

        <ProfileClient
          profile={{
            name: userRecord.name,
            email: userRecord.email,
            phone: userRecord.phone ?? null,
            phoneVerified: userRecord.phoneVerified,
            emailVerified: userRecord.emailVerified,
            role: userRecord.role,
            avatarUrl: userRecord.avatarUrl ?? null,
            createdAt: userRecord.createdAt.toISOString(),
          }}
        />
      </div>
    </main>
  );
}
