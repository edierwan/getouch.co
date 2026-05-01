import { Breadcrumb, PageIntro } from '../../ui';
import { ApiKeyManagerConsole } from '../../api-keys/ApiKeyManagerConsole';

export const dynamic = 'force-dynamic';

export default function DeveloperWebhooksPage() {
  return (
    <div className="portal-body">
      <Breadcrumb category="Automation & Data Flow" page="Webhooks" />
      <PageIntro
        title="Webhooks"
        subtitle="Endpoint signing, delivery credentials, and integration keying for portal-managed services."
      />
      <ApiKeyManagerConsole />
    </div>
  );
}