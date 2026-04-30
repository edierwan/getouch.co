/**
 * WhatsApp messaging helper — talks to the internal `wa` service via HTTP.
 * Uses WA_URL (default: http://wa:3001) and WA_API_KEY env vars.
 */

const WA_URL = process.env.WA_URL || 'http://baileys-gateway:3001';
const WA_API_KEY = process.env.WA_API_KEY || '';

/**
 * Normalise a Malaysian phone number to international format (60xxxxxxxxx).
 * Accepts: 0192277233, +60192277233, 60192277233, 192277233
 * Returns: '60192277233' or null if invalid
 */
export function normalizeMyPhone(raw: string): string | null {
  let digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits || digits.length < 8 || digits.length > 15) return null;

  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 12) {
    digits = '60' + digits.slice(1);
  } else if (!digits.startsWith('60') && digits.length >= 9 && digits.length <= 10) {
    digits = '60' + digits;
  }

  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Generate a 4-digit OTP string */
export function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Send a WhatsApp text message via the Getouch WA service */
export async function sendWhatsAppText(to: string, text: string): Promise<boolean> {
  if (!WA_API_KEY) {
    console.error('[WA] WA_API_KEY not configured');
    return false;
  }

  const phone = normalizeMyPhone(to);
  if (!phone) {
    console.error('[WA] Invalid phone number:', to);
    return false;
  }

  try {
    const res = await fetch(`${WA_URL}/api/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': WA_API_KEY,
      },
      body: JSON.stringify({ to: phone, text }),
    });

    if (res.ok) {
      console.log(`[WA] Message sent to ${phone}`);
      return true;
    }

    const body = await res.text();
    console.error(`[WA] Failed sending to ${phone}: ${res.status} ${body}`);
    return false;
  } catch (err) {
    console.error('[WA] Network error:', err);
    return false;
  }
}

/** Send a 4-digit OTP to the given Malaysian phone via WhatsApp */
export async function sendOtpWhatsApp(phone: string, otp: string, name: string): Promise<boolean> {
  const message =
    `Hi ${name}! 👋\n\n` +
    `Your Getouch verification code is:\n\n` +
    `*${otp}*\n\n` +
    `This code expires in 10 minutes. Do not share it with anyone.\n\n` +
    `— Getouch Team`;

  return sendWhatsAppText(phone, message);
}
