import { ServiceOverviewPageByKey } from '../../_components/ServiceOverviewPage';

export const dynamic = 'force-dynamic';

export default function SystemAuthentikPage() {
  return <ServiceOverviewPageByKey configKey="authentik" />;
}