import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runAiRuntimeAction } from '@/lib/ai-runtime';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function POST() {
  const response = await requireAdmin();
  if (response) return response;

  try {
    const result = await runAiRuntimeAction('restore-ollama');
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to restore Ollama mode';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}