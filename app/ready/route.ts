import { handleGatewayReady } from '@/lib/ai-gateway';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handleGatewayReady(request);
}