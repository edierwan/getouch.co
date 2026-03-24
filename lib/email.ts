import nodemailer from 'nodemailer';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://auth.getouch.co';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
) {
  const verifyUrl = `${BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@getouch.co';
  const fromName = process.env.SMTP_FROM_NAME || 'Getouch';
  const subject = 'Verify your Getouch account';
  const html = buildVerificationHtml(name, verifyUrl);

  const transporter = getTransporter();
  if (!transporter) {
    console.error('[EMAIL] SMTP not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS)');
    console.log(`[VERIFY] Manual verification link for ${to}: ${verifyUrl}`);
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Verification email sent to ${to}, messageId: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send verification email:', err);
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
