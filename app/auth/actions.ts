'use server';

import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import {
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export async function login(_prev: unknown, formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  let user;

  // Try Supabase SSO authentication first
  try {
    const supabase = getSupabase();
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (!authError && authData.user) {
      // SSO auth succeeded — find or create local user record
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        user = existing;
      } else {
        // Create local record linked to SSO user
        const [newUser] = await db
          .insert(users)
          .values({
            id: authData.user.id,
            name: authData.user.user_metadata?.name || email.split('@')[0],
            email,
            passwordHash: 'SSO_MANAGED',
            role: 'pending',
          })
          .returning();
        user = newUser;
      }
    }
  } catch {
    // SSO unavailable — fall through to local auth
  }

  // Fallback: local password auth (backward compatibility for existing users)
  if (!user) {
    const [localUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!localUser || localUser.passwordHash === 'SSO_MANAGED') {
      return { error: 'Invalid email or password.' };
    }

    const valid = await verifyPassword(password, localUser.passwordHash);
    if (!valid) {
      return { error: 'Invalid email or password.' };
    }

    user = localUser;
  }

  if (user.role === 'pending') {
    return { error: 'Your account is pending approval. Please contact an admin.' };
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  await setSessionCookie(token);
  redirect('/admin');
}

export async function register(_prev: unknown, formData: FormData) {
  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!name || !email || !password) {
    return { error: 'All fields are required.' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  // Create user in Supabase SSO (Identity DB)
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    if (
      error.message.includes('already registered') ||
      error.message.includes('already exists')
    ) {
      return { error: 'An account with this email already exists.' };
    }
    return { error: 'Registration failed. Please try again.' };
  }

  // Also create local user record for platform management
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!existing.length && data.user) {
    await db.insert(users).values({
      id: data.user.id,
      name,
      email,
      passwordHash: 'SSO_MANAGED',
      role: 'pending',
    });
  }

  return { success: 'Account created! An admin will review your access shortly.' };
}

export async function logout() {
  await clearSessionCookie();
  redirect('/auth/login');
}
