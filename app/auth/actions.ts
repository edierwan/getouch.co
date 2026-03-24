'use server';

import { db } from '@/lib/db';
import { users, verificationTokens } from '@/lib/schema';
import {
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { sendVerificationEmail } from '@/lib/email';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import crypto from 'crypto';

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
    if (!supabase) throw new Error('SSO not configured');
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

  if (!user.emailVerified) {
    return { error: 'Please verify your email before logging in. Check your inbox for the verification link.' };
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

  // Redirect based on role
  if (user.role === 'admin') {
    redirect('/admin');
  } else {
    redirect('/portal');
  }
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
  if (!supabase) {
    return { error: 'SSO service is not configured. Please contact an admin.' };
  }

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

  let userId: string;

  if (!existing.length && data.user) {
    const [newUser] = await db.insert(users).values({
      id: data.user.id,
      name,
      email,
      passwordHash: 'SSO_MANAGED',
      role: 'pending',
      emailVerified: false,
    }).returning();
    userId = newUser.id;
  } else if (existing.length) {
    userId = existing[0].id;
  } else {
    return { error: 'Registration failed. Please try again.' };
  }

  // Generate verification token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.insert(verificationTokens).values({
    userId,
    token,
    expiresAt,
  });

  // Send verification email
  await sendVerificationEmail(email, name, token);

  return { success: 'Account created! Please check your email to verify your account.' };
}

export async function logout() {
  await clearSessionCookie();
  redirect('/auth/login');
}
