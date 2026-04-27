'use server';

import path from 'node:path';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { queuePreprodRestore, runPreprodBackupNow } from '@/lib/preprod-backups';

const PAGE_PATH = '/admin/databases';

function redirectWith(params: URLSearchParams) {
  const query = params.toString();
  redirect(query ? `${PAGE_PATH}?${query}` : PAGE_PATH);
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    redirect('/portal');
  }
}

export async function triggerPreprodBackup() {
  await requireAdmin();

  try {
    await runPreprodBackupNow();
    revalidatePath(PAGE_PATH);
    redirectWith(new URLSearchParams({ notice: 'Preprod backup created successfully.' }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup failed.';
    redirectWith(new URLSearchParams({ error: message }));
  }
}

export async function triggerPreprodRestore(formData: FormData) {
  await requireAdmin();

  const backupPath = String(formData.get('backupPath') || '');
  const confirmation = String(formData.get('confirmation') || '').trim();
  const backupName = path.posix.basename(backupPath);

  if (!backupPath || !backupName) {
    redirectWith(new URLSearchParams({ error: 'Backup selection is missing.' }));
  }

  const expectedConfirmation = `RESTORE ${backupName}`;
  if (confirmation !== expectedConfirmation) {
    redirectWith(new URLSearchParams({ error: `Confirmation text must match: ${expectedConfirmation}` }));
  }

  try {
    const job = await queuePreprodRestore(backupPath);
    revalidatePath(PAGE_PATH);
    redirectWith(new URLSearchParams({ notice: `Restore queued for ${backupName}. Job: ${job.requestId}` }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Restore failed to start.';
    redirectWith(new URLSearchParams({ error: message }));
  }
}