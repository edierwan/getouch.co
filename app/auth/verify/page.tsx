import { db } from '@/lib/db';
import { users, verificationTokens, appProvisions } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import crypto from 'crypto';

async function provisionUserToOpenWebUI(user: { id: string; name: string; email: string }) {
  const baseUrl = process.env.OPEN_WEBUI_URL || 'https://ai.getouch.co';
  const adminToken = process.env.OPEN_WEBUI_ADMIN_TOKEN;
  if (!adminToken) return;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    const res = await fetch(`${baseUrl}/api/v1/auths/signup`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        password: crypto.randomUUID(),
        role: 'user',
      }),
    });

    if (res.ok) {
      const data = await res.json();

      // Activate the user in Open WebUI (change from pending to user)
      await fetch(`${baseUrl}/api/v1/users/${data.id}/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'user' }),
      });

      await db
        .insert(appProvisions)
        .values({
          userId: user.id,
          app: 'open_webui',
          externalId: data.id,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [appProvisions.userId, appProvisions.app],
          set: { externalId: data.id, syncedAt: new Date() },
        });
    }
  } catch (err) {
    console.error('Auto Open WebUI provision error:', err);
  }
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="auth-card">
        <div className="auth-card-header">
          <h1>Invalid Link</h1>
          <p>No verification token provided.</p>
        </div>
        <p className="auth-switch">
          <Link href="/auth/login">Back to login</Link>
        </p>
      </div>
    );
  }

  // Find the verification token
  const [record] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);

  if (!record) {
    return (
      <div className="auth-card">
        <div className="auth-card-header">
          <h1>Invalid Link</h1>
          <p>This verification link is invalid or has already been used.</p>
        </div>
        <p className="auth-switch">
          <Link href="/auth/login">Back to login</Link>
        </p>
      </div>
    );
  }

  if (new Date() > record.expiresAt) {
    // Clean up expired token
    await db.delete(verificationTokens).where(eq(verificationTokens.id, record.id));
    return (
      <div className="auth-card">
        <div className="auth-card-header">
          <h1>Link Expired</h1>
          <p>This verification link has expired. Please register again.</p>
        </div>
        <p className="auth-switch">
          <Link href="/auth/register">Register again</Link>
        </p>
      </div>
    );
  }

  // Verify the user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, record.userId))
    .limit(1);

  if (!user) {
    return (
      <div className="auth-card">
        <div className="auth-card-header">
          <h1>Error</h1>
          <p>User not found.</p>
        </div>
        <p className="auth-switch">
          <Link href="/auth/register">Register again</Link>
        </p>
      </div>
    );
  }

  // Mark email as verified and auto-approve user
  await db
    .update(users)
    .set({
      emailVerified: true,
      role: 'user',
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Delete the used token
  await db.delete(verificationTokens).where(eq(verificationTokens.id, record.id));

  // Auto-provision to Open WebUI
  await provisionUserToOpenWebUI({ id: user.id, name: user.name, email: user.email });

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <h1>Email Verified!</h1>
        <p>Your account has been activated. You can now sign in.</p>
      </div>
      <div className="auth-success" style={{ textAlign: 'center' }}>
        Your account is ready. You can now access Getouch AI Chat and all platform services.
      </div>
      <p className="auth-switch" style={{ marginTop: '1.5rem' }}>
        <Link href="/auth/login">Sign in to your account</Link>
      </p>
    </div>
  );
}
