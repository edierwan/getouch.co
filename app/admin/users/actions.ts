'use server';

import { db } from '@/lib/db';
import { users, appProvisions } from '@/lib/schema';
import { getSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function updateUserRole(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return;

  const userId = formData.get('userId') as string;
  const newRole = formData.get('role') as 'admin' | 'user' | 'pending';

  if (!userId || !['admin', 'user', 'pending'].includes(newRole)) return;

  // Prevent self-demotion
  if (userId === session.userId && newRole !== 'admin') return;

  await db
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.id, userId));

  revalidatePath('/admin/users');
  revalidatePath('/admin');
}

export async function provisionToOpenWebUI(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return;

  const userId = formData.get('userId') as string;
  if (!userId) return;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  const baseUrl = process.env.OPEN_WEBUI_URL || 'https://ai.getouch.co';
  const adminToken = process.env.OPEN_WEBUI_ADMIN_TOKEN;
  if (!adminToken) {
    console.error('OPEN_WEBUI_ADMIN_TOKEN not configured');
    return;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    };

    // If using internal Caddy URL, add Host header
    if (baseUrl.includes('caddy')) {
      headers['Host'] = 'ai.getouch.co';
    }

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
    } else {
      const text = await res.text();
      console.error('Open WebUI provision failed:', res.status, text);
    }
  } catch (err) {
    console.error('Open WebUI provision error:', err);
  }

  revalidatePath('/admin/users');
}
