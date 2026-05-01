import { ServiceOverviewPageByKey } from '../../_components/ServiceOverviewPage';

export const dynamic = 'force-dynamic';

export default function InfraCoolifyPage() {
  return <ServiceOverviewPageByKey configKey="coolify" />;
}