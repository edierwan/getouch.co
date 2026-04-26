'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { triggerPreprodBackup, triggerPreprodRestore } from './actions';

function SubmitButton({ idleLabel, pendingLabel, className }: { idleLabel: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function BackupNowForm() {
  return (
    <form action={triggerPreprodBackup}>
      <SubmitButton idleLabel="Create Backup Now" pendingLabel="Creating Backup..." className="portal-admin-btn portal-admin-btn-primary" />
    </form>
  );
}

export function RestoreBackupDialog({
  backupName,
  backupPath,
  createdAt,
}: {
  backupName: string;
  backupPath: string;
  createdAt: string;
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
                This will restore Serapod Preprod from backup <strong>{createdAt}</strong>.
              </p>

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