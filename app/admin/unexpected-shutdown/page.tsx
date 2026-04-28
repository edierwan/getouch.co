import { PageIntro } from '../ui';
import { UnexpectedShutdownConsole } from './UnexpectedShutdownConsole';

export const dynamic = 'force-dynamic';

export default function UnexpectedShutdownPage() {
  return (
    <div className="portal-body">
      <PageIntro
        title="Unexpected Shutdown Analysis"
        subtitle="Evidence-first diagnostics for abnormal reboot, offline, shutdown, and crash-like events on the self-hosted VPS."
      />
      <UnexpectedShutdownConsole />
    </div>
  );
}