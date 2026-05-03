import { NextRequest, NextResponse } from 'next/server';
import { authorizePlatformAppRequest, sendPlatformBrokerTextMessage } from '@/lib/platform-broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const purpose = typeof body.purpose === 'string' ? body.purpose.trim().slice(0, 80) : 'platform_message';

  if (!to) {
    return NextResponse.json({ error: 'to_required', message: 'Recipient phone number is required.' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'message_required', message: 'Message text is required.' }, { status: 400 });
  }

  const result = await sendPlatformBrokerTextMessage({
    appCode: auth.app.appCode,
    to,
    text: message,
    preview: message,
    eventType: 'platform.broker.whatsapp.send_message',
    eventSummary: `Platform broker WhatsApp message for ${auth.app.appCode}`,
    metadata: { purpose },
    messagePurpose: 'platform_message',
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