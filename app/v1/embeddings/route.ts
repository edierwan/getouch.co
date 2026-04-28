import { handleGatewayEmbeddings } from '@/lib/ai-gateway';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleGatewayEmbeddings(request);
}
