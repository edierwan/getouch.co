'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { PreprodBackupOverview } from '@/lib/preprod-backups';
import { triggerPreprodRestore } from './actions';

function SubmitButton({ idleLabel, pendingLabel, className }: { idleLabel: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

type BackupResponse =
  | {
      ok: true;
      message: string;
      backupId: string;
      overview: PreprodBackupOverview;
    }
  | {
      ok: false;
      error: string;
    };

export function BackupNowForm({
  onStart,
  onSuccess,
  onError,
}: {
  onStart?: () => void;
  onSuccess: (payload: { message: string; backupId: string; overview: PreprodBackupOverview }) => void;
  onError: (message: string) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    onStart?.();

    try {
      const response = await fetch('/api/admin/preprod-backups', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });

      const payload = (await response.json().catch(() => null)) as BackupResponse | null;

      if (!response.ok || !payload?.ok) {
        onError(payload && 'error' in payload ? payload.error : 'Preprod backup failed.');
        return;
      }

      onSuccess({ message: payload.message, backupId: payload.backupId, overview: payload.overview });
    } catch {
      onError('Preprod backup failed before the server responded.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" className="portal-admin-btn portal-admin-btn-primary" disabled={isSubmitting}>
        <span className="portal-admin-btn-content">
          {isSubmitting ? <span className="portal-inline-spinner" aria-hidden="true" /> : null}
          <span>{isSubmitting ? 'Creating Backup...' : 'Create Backup Now'}</span>
        </span>
      </button>
      {isSubmitting ? (
        <p className="portal-inline-status" aria-live="polite">
          Running the preprod backup script and refreshing history when it completes.
        </p>
      ) : null}
    </form>
  );
}

export function RestoreBackupDialog({
  backupName,
  backupPath,
  createdAtLabel,
}: {
  backupName: string;
  backupPath: string;
  createdAtLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="portal-admin-btn portal-admin-btn-danger" onClick={() => setOpen(true)}>
        Restore
      </button>

      {open ? (
        <div className="portal-modal-backdrop" role="presentation">
          <div className="portal-modal" role="dialog" aria-modal="true" aria-labelledby={`restore-title-${backupName}`}>
            <div className="portal-modal-head">
              <h3 id={`restore-title-${backupName}`} className="portal-modal-title">
                Restore from backup
              </h3>
              <button type="button" className="portal-modal-close" onClick={() => setOpen(false)} aria-label="Close restore dialog">
                ×
              </button>
            </div>

            <div className="portal-modal-body">
              <p className="portal-modal-copy">
                This will restore Serapod Preprod from <strong>{createdAtLabel}</strong>.
              </p>

              <p className="portal-inline-status">Backup ID {backupName}</p>

              <div className="portal-warning-box">
                <div className="portal-warning-title">This action cannot be undone</div>
                <ul className="portal-warning-list">
                  <li>Your project will be offline during restoration.</li>
                  <li>Any new data since this backup will be lost.</li>
                  <li>Storage files in the backup will replace current preprod storage if an archive exists.</li>
                </ul>
              </div>

              <form action={triggerPreprodRestore} className="portal-restore-form">
                <input type="hidden" name="backupPath" value={backupPath} />

                <label className="portal-form-label" htmlFor={`confirmation-${backupName}`}>
                  Type <strong>{`RESTORE ${backupName}`}</strong> to continue
                </label>
                <input id={`confirmation-${backupName}`} name="confirmation" type="text" className="portal-text-input" autoComplete="off" />

                <div className="portal-modal-actions">
                  <button type="button" className="portal-admin-btn portal-admin-btn-secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <SubmitButton idleLabel="Restore" pendingLabel="Queueing Restore..." className="portal-admin-btn portal-admin-btn-danger" />
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}