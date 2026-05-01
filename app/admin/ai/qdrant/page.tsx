import { ServiceOverviewPageByKey } from '../../_components/ServiceOverviewPage';

export const dynamic = 'force-dynamic';

export default function AiQdrantPage() {
  return <ServiceOverviewPageByKey configKey="qdrant" />;
}