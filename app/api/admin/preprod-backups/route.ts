import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPreprodBackupOverview, runPreprodBackupNow } from '@/lib/preprod-backups';

const PAGE_PATH = '/admin/infrastructure/databases';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const startedAt = Date.now();
  console.info('[preprod-backup] manual backup requested', {
    actor: session.email,
    userId: session.userId,
  });

  try {
    const backup = await runPreprodBackupNow();
    const overview = await getPreprodBackupOverview();
    revalidatePath(PAGE_PATH);

    console.info('[preprod-backup] manual backup completed', {
      actor: session.email,
      backupName: backup.backupName,
      backupPath: backup.backupPath,
      durationMs: Date.now() - startedAt,
      outputLines: backup.outputLines,
    });

    return NextResponse.json({
      ok: true,
      message: 'Preprod backup created successfully.',
      backupId: backup.backupName,
      overview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preprod backup failed.';

    console.error('[preprod-backup] manual backup failed', {
      actor: session.email,
      durationMs: Date.now() - startedAt,
      error: message,
    });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}