import { handleGatewayModels } from '@/lib/ai-gateway';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handleGatewayModels(request);
}