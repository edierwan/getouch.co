import { getMcpHealthzResponse } from '@/lib/mcp-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return getMcpHealthzResponse();
}