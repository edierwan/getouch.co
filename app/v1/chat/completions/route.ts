import { handleGatewayChatCompletion } from '@/lib/ai-gateway';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleGatewayChatCompletion(request);
}