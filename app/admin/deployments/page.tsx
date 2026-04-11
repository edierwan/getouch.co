import { DEPLOYMENT_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function DeploymentsPage() {
  return (
    <div className="portal-body">
      <PageIntro title="Deployments" subtitle="Environment branches and release flow managed by Coolify." />
      <ServicePanel title="DEPLOYMENT TARGETS" rows={DEPLOYMENT_ROWS} />
    </div>
  );
}
