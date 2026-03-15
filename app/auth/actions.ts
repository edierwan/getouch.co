'use server';

import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export async function login(_prev: unknown, formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return { error: 'Invalid email or password.' };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: 'Invalid email or password.' };
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

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length) {
    return { error: 'An account with this email already exists.' };
  }

  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    name,
    email,
    passwordHash,
    role: 'pending',
  });

  return { success: 'Account created! An admin will review your access shortly.' };
}

export async function logout() {
  await clearSessionCookie();
  redirect('/auth/login');
}
