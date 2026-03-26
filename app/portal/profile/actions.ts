'use server';

import { db } from '@/lib/db';
import { users, waOtpTokens } from '@/lib/schema';
import { getSession } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { normalizeMyPhone, generateOtp, sendOtpWhatsApp } from '@/lib/wa';

export async function updateProfile(_prev: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated.' };

  const name = (formData.get('name') as string)?.trim();
  const phone = (formData.get('phone') as string)?.trim();
  const avatarUrl = (formData.get('avatarUrl') as string)?.trim() || null;

  if (!name) return { error: 'Name is required.' };

  let normalizedPhone: string | null = null;
  if (phone) {
    normalizedPhone = normalizeMyPhone(phone);
    if (!normalizedPhone) {
      return { error: 'Invalid phone number. Use Malaysian format e.g. 0123456789.' };
    }
  }

  const [currentUser] = await db
    .select({ phone: users.phone, phoneVerified: users.phoneVerified })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  // If phone changed, reset phone verification
  const phoneChanged = normalizedPhone !== currentUser?.phone;
  const updateData: Record<string, unknown> = {
    name,
    phone: normalizedPhone,
    avatarUrl,
    updatedAt: new Date(),
  };
  if (phoneChanged) {
    updateData.phoneVerified = false;
  }

  await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, session.userId));

  revalidatePath('/portal');
  revalidatePath('/portal/profile');

  return { success: 'Profile updated successfully.' };
}

export async function sendPhoneOtp(_prev: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated.' };

  const phone = (formData.get('phone') as string)?.trim();
  if (!phone) return { error: 'Phone number is required.' };

  const normalizedPhone = normalizeMyPhone(phone);
  if (!normalizedPhone) {
    return { error: 'Invalid phone number. Use Malaysian format e.g. 0123456789.' };
  }

  // Check the phone belongs to this user
  const [userRecord] = await db
    .select({ name: users.name, phone: users.phone, phoneVerified: users.phoneVerified })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!userRecord) return { error: 'User not found.' };
  if (userRecord.phone !== normalizedPhone) {
    return { error: 'Please save your profile with the new phone number first.' };
  }
  if (userRecord.phoneVerified) {
    return { error: 'Phone number is already verified.' };
  }

  // Delete old OTPs for this phone
  await db.delete(waOtpTokens).where(eq(waOtpTokens.phone, normalizedPhone));

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await db.insert(waOtpTokens).values({ phone: normalizedPhone, otp, expiresAt });

  const sent = await sendOtpWhatsApp(normalizedPhone, otp, userRecord.name);
  if (!sent) {
    return { error: 'Failed to send WhatsApp message. Please check your number or try again.' };
  }

  return {
    success: `Verification code sent to +${normalizedPhone} on WhatsApp!`,
    pendingPhone: normalizedPhone,
  };
}

export async function verifyPhone(_prev: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: 'Not authenticated.' };

  const phone = (formData.get('phone') as string)?.trim();
  const otp = (formData.get('otp') as string)?.trim();

  if (!phone || !otp || otp.length !== 4) {
    return { error: 'Please enter the 4-digit code.' };
  }

  const now = new Date();

  const { and, gt } = await import('drizzle-orm');
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

  // Confirm this phone belongs to the current user
  const [userRecord] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!userRecord || userRecord.phone !== phone) {
    return { error: 'Phone mismatch. Please update your profile and try again.' };
  }

  await db
    .update(users)
    .set({ phoneVerified: true, updatedAt: new Date() })
    .where(eq(users.id, session.userId));

  await db.delete(waOtpTokens).where(eq(waOtpTokens.id, record.id));

  revalidatePath('/portal');
  revalidatePath('/portal/profile');

  return { success: 'Phone verified successfully! ✓' };
}
