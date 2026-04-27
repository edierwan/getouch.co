import { PageIntro } from '../ui';
import { ScheduledRestartConsole } from './ScheduledRestartConsole';

export const dynamic = 'force-dynamic';

export default function ScheduledRestartPage() {
  return (
    <div className="portal-body">
      <PageIntro
        title="Scheduled Restart"
        subtitle="Manage safe scheduled reboot windows for the primary portal server from the Monitoring section."
      />
      <ScheduledRestartConsole />
    </div>
  );
}