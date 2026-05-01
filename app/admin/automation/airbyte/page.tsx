import { ServiceOverviewPageByKey } from '../../_components/ServiceOverviewPage';

export const dynamic = 'force-dynamic';

export default function AutomationAirbytePage() {
  return <ServiceOverviewPageByKey configKey="airbyte" />;
}