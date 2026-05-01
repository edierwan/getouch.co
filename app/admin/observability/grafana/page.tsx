import { ServiceOverviewPageByKey } from '../../_components/ServiceOverviewPage';

export const dynamic = 'force-dynamic';

export default function ObservabilityGrafanaPage() {
  return <ServiceOverviewPageByKey configKey="grafana" />;
}