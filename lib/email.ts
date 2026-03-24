import { getSupabaseAdmin } from './supabase';

const FROM_EMAIL = 'admin@getouch.co';
const FROM_NAME = 'Getouch';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://auth.getouch.co';

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
) {
  const verifyUrl = `${BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`;

  // Try Supabase Edge Function for email sending
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || '587';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    // Use nodemailer-compatible SMTP via fetch to avoid extra dependency
    // We'll use Supabase's built-in email or a simple HTTP-based approach
    return await sendViaSMTP(to, name, verifyUrl, {
      host: smtpHost,
      port: parseInt(smtpPort),
      user: smtpUser,
      pass: smtpPass,
    });
  }

  // Fallback: Use Supabase Auth's built-in email (if configured)
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.inviteUserByEmail(to, {
      data: { name, verification_url: verifyUrl },
      redirectTo: verifyUrl,
    });
    if (error) {
      console.error('Supabase email invite failed:', error.message);
      // Log the verification URL for manual fallback
      console.log(`[VERIFY] Manual verification link for ${to}: ${verifyUrl}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Email sending failed:', err);
    console.log(`[VERIFY] Manual verification link for ${to}: ${verifyUrl}`);
    return false;
  }
}

async function sendViaSMTP(
  to: string,
  name: string,
  verifyUrl: string,
  smtp: { host: string; port: number; user: string; pass: string },
) {
  // Build email payload for SMTP relay
  // Using a lightweight HTTP-to-SMTP bridge or direct SMTP
  const subject = 'Verify your Getouch account';
  const html = buildVerificationHtml(name, verifyUrl);

  try {
    // If we have a mail API endpoint (Resend, Mailgun, etc.)
    const mailApiUrl = process.env.MAIL_API_URL;
    const mailApiKey = process.env.MAIL_API_KEY;

    if (mailApiUrl && mailApiKey) {
      const res = await fetch(mailApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mailApiKey}`,
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to,
          subject,
          html,
        }),
      });
      return res.ok;
    }

    // Fallback: Log verification URL
    console.log(`[VERIFY] Email for ${to}: ${verifyUrl}`);
    return false;
  } catch (err) {
    console.error('SMTP send error:', err);
    console.log(`[VERIFY] Manual verification link for ${to}: ${verifyUrl}`);
    return false;
  }
}

function buildVerificationHtml(name: string, verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:'Inter',-apple-system,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#16161a;border-radius:16px;border:1px solid rgba(255,255,255,0.06);">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="color:#6366f1;font-size:28px;font-weight:800;">◆ Getouch</span>
    </div>
    <h1 style="color:#ededef;font-size:22px;font-weight:700;text-align:center;margin:0 0 8px;">
      Verify your email
    </h1>
    <p style="color:#8b8b94;font-size:14px;text-align:center;margin:0 0 24px;">
      Hi ${name}, click the button below to activate your Getouch account.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">
        Verify Email
      </a>
    </div>
    <p style="color:#8b8b94;font-size:12px;text-align:center;margin:0;">
      This link expires in 24 hours. If you didn't create an account, ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:24px 0 16px;" />
    <p style="color:#8b8b94;font-size:11px;text-align:center;margin:0;">
      &copy; 2026 Getouch. All rights reserved.
    </p>
  </div>
</body>
</html>`;
}
