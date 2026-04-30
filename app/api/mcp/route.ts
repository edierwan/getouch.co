import { NextRequest, NextResponse } from 'next/server';
import { handleMcpOptions, handleMcpPost } from '@/lib/mcp-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleMcpPost(request);
}

export async function OPTIONS(request: NextRequest) {
  return handleMcpOptions(request);
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
}