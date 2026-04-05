'use server';

import { db } from '@/lib/db';
import { users, verificationTokens, waOtpTokens } from '@/lib/schema';
import {
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { sendVerificationEmail } from '@/lib/email';
import { normalizeMyPhone, generateOtp, sendOtpWhatsApp } from '@/lib/wa';
import { eq, and, gt } from 'drizzle-orm';
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

  // Allow login if email OR phone is verified
  if (!user.emailVerified && !user.phoneVerified) {
    return { error: 'Please verify your account before logging in. Check your email or WhatsApp for the verification code.' };
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
  const phone = (formData.get('phone') as string)?.trim();
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

  // Validate phone if provided
  let normalizedPhone: string | null = null;
  if (phone) {
    normalizedPhone = normalizeMyPhone(phone);
    if (!normalizedPhone) {
      return { error: 'Invalid phone number. Please enter a valid Malaysian mobile number (e.g. 0123456789).' };
    }
  }

  // Check for existing local user first
  const [existingLocal] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingLocal) {
    return { error: 'An account with this email already exists.' };
  }

  // Create user in Supabase SSO
  const supabase = getSupabase();
  if (!supabase) {
    return { error: 'SSO service is not configured. Please contact an admin.' };
  }

  let supabaseUserId: string | null = null;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    const isAlreadyExists =
      error.message.includes('already registered') ||
      error.message.includes('already exists') ||
      error.message.includes('User already registered');

    if (isAlreadyExists) {
      // First attempt to re-link using provided credentials.
      // This handles the common orphan case where Supabase user exists
      // but local user row was deleted.
      const { data: loginData, error: loginError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (!loginError && loginData.user) {
        supabaseUserId = loginData.user.id;
      } else {
        // Fallback: cleanup orphan via admin API (if configured), then retry signup.
        try {
          const { getSupabaseAdmin } = await import('@/lib/supabase');
          const adminClient = getSupabaseAdmin();
          const { data: listData } = await adminClient.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          const orphan = listData?.users?.find(
            (u: { email?: string }) => u.email === email,
          );

          if (orphan) {
            await adminClient.auth.admin.deleteUser(orphan.id);
            const { data: retryData, error: retryError } = await supabase.auth.signUp({
              email,
              password,
              options: { data: { name } },
            });
            if (retryError || !retryData.user) {
              return { error: 'Registration failed after cleanup. Please try again.' };
            }
            supabaseUserId = retryData.user.id;
          } else {
            return { error: 'An account with this email already exists.' };
          }
        } catch (cleanupErr) {
          console.error('[REGISTER] Orphan cleanup failed:', cleanupErr);
          return { error: 'An account with this email already exists.' };
        }
      }
    } else {
      return { error: 'Registration failed. Please try again.' };
    }
  } else {
    supabaseUserId = data.user?.id ?? null;
  }

  if (!supabaseUserId) {
    return { error: 'Registration failed. Please try again.' };
  }

  // Create local user record
  const [newUser] = await db
    .insert(users)
    .values({
      id: supabaseUserId,
      name,
      email,
      passwordHash: 'SSO_MANAGED',
      role: 'pending',
      emailVerified: false,
      phone: normalizedPhone,
      phoneVerified: false,
    })
    .returning();

  // Generate email verification token
  const token = crypto.randomBytes(32).toString('hex');
  const emailExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.insert(verificationTokens).values({
    userId: newUser.id,
    token,
    expiresAt: emailExpiry,
  });

  // Send verification email (non-blocking)
  sendVerificationEmail(email, name, token).catch((err) =>
    console.error('[REGISTER] Email send failed:', err),
  );

  // Send WhatsApp OTP if phone provided
  if (normalizedPhone) {
    // Clean up any old OTPs for this phone
    await db
      .delete(waOtpTokens)
      .where(eq(waOtpTokens.phone, normalizedPhone));

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(waOtpTokens).values({
      phone: normalizedPhone,
      otp,
      expiresAt: otpExpiry,
    });

    // Send OTP via WhatsApp (non-blocking)
    sendOtpWhatsApp(normalizedPhone, otp, name).catch((err) =>
      console.error('[REGISTER] WA OTP send failed:', err),
    );

    return {
      success: 'Account created! Verify via the code sent to your WhatsApp, or click the link in your email.',
      requireOtp: true,
      phone: normalizedPhone,
    };
  }

  return {
    success: 'Account created! Please check your email to verify your account.',
    requireOtp: false,
  };
}

export async function verifyWhatsappOtp(_prev: unknown, formData: FormData) {
  const phone = (formData.get('phone') as string)?.trim();
  const otp = (formData.get('otp') as string)?.trim();

  if (!phone || !otp || otp.length !== 4) {
    return { error: 'Please enter the 4-digit code sent to your WhatsApp.' };
  }

  const now = new Date();

  // Find valid OTP record
  const [record] = await db
    .select()
    .from(waOtpTokens)
    .where(
      and(
        eq(waOtpTokens.phone, phone),
        eq(waOtpTokens.otp, otp),
        gt(waOtpTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!record) {
    return { error: 'Invalid or expired code. Please request a new one.' };
  }

  // Find the user with this phone
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user) {
    return { error: 'Account not found. Please register again.' };
  }

  // Activate the account
  await db
    .update(users)
    .set({
      phoneVerified: true,
      role: 'user',
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Delete used OTP
  await db.delete(waOtpTokens).where(eq(waOtpTokens.id, record.id));

  // Auto-provision to Open WebUI
  await provisionUserToOpenWebUI({ id: user.id, name: user.name, email: user.email });

  // Create session and redirect
  const sessionToken = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: 'user',
    name: user.name,
  });
  await setSessionCookie(sessionToken);

  redirect('/portal');
}

export async function resendWhatsappOtp(_prev: unknown, formData: FormData) {
  const phone = (formData.get('phone') as string)?.trim();

  if (!phone) return { error: 'Phone number is required.' };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!user) return { error: 'Account not found.' };
  if (user.phoneVerified) return { error: 'Phone already verified.' };

  // Delete old OTPs
  await db.delete(waOtpTokens).where(eq(waOtpTokens.phone, phone));

  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(waOtpTokens).values({ phone, otp, expiresAt: otpExpiry });

  await sendOtpWhatsApp(phone, otp, user.name).catch((err) =>
    console.error('[RESEND] WA OTP failed:', err),
  );

  return { success: 'New code sent to your WhatsApp!' };
}

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
      const owData = await res.json();
      // Ensure role is 'user' not 'pending'
      await fetch(`${baseUrl}/api/v1/users/${owData.id}/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'user' }),
      });

      const { appProvisions } = await import('@/lib/schema');
      await db
        .insert(appProvisions)
        .values({
          userId: user.id,
          app: 'open_webui',
          externalId: owData.id,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [appProvisions.userId, appProvisions.app],
          set: { externalId: owData.id, syncedAt: new Date() },
        });
    }
  } catch (err) {
    console.error('[PROVISION] Open WebUI error:', err);
  }
}

export async function logout() {
  await clearSessionCookie();
  redirect('/auth/login');
}
