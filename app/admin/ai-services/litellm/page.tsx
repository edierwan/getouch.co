import { ServiceOverviewPageByKey } from '../../_components/ServiceOverviewPage';

export const dynamic = 'force-dynamic';

export default function AiServicesLiteLlmPage() {
	return <ServiceOverviewPageByKey configKey="litellm" />;
}