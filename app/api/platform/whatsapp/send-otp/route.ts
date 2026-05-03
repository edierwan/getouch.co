import { NextRequest, NextResponse } from 'next/server';
import { authorizePlatformAppRequest, sendPlatformBrokerTextMessage } from '@/lib/platform-broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildOtpMessage(code: string, businessName: string) {
  return `${businessName}: your verification code is ${code}. This code expires in 10 minutes.`;
}

export async function POST(req: NextRequest) {
  const auth = await authorizePlatformAppRequest(req.headers, 'platform:whatsapp');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const businessName = typeof body.business_name === 'string' && body.business_name.trim()
    ? body.business_name.trim().slice(0, 120)
    : auth.app.name;

  if (!to) {
    return NextResponse.json({ error: 'to_required', message: 'Recipient phone number is required.' }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'code_invalid', message: 'OTP code must be 4 to 8 digits.' }, { status: 400 });
  }

  const result = await sendPlatformBrokerTextMessage({
    appCode: auth.app.appCode,
    to,
    text: buildOtpMessage(code, businessName),
    preview: `OTP for ${businessName}`,
    eventType: 'platform.broker.whatsapp.send_otp',
    eventSummary: `Platform broker OTP for ${auth.app.appCode}`,
    metadata: { businessName },
    messagePurpose: 'otp',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.detail }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    instance: result.instance,
    to: result.to,
    message_id: result.messageId,
  });
}