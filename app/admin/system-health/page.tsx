import { SYSTEM_HEALTH_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function SystemHealthPage() {
  return (
    <div className="portal-body">
      <PageIntro title="System Health" subtitle="Operational checks and deployment health for the current VPS state." />
      <ServicePanel title="HEALTH OVERVIEW" rows={SYSTEM_HEALTH_ROWS} />
    </div>
  );
}
