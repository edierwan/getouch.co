import { Breadcrumb, PageIntro } from '../../ui';
import { ApiKeyManagerConsole } from '../../api-keys/ApiKeyManagerConsole';

export const dynamic = 'force-dynamic';

export default function DeveloperDocsPage() {
  return (
    <div className="portal-body">
      <Breadcrumb category="Access & Security" page="SDK & Docs" />
      <PageIntro
        title="SDK & Docs"
        subtitle="Developer-facing reference material, service auth surfaces, and integration guidance for portal-managed APIs."
      />
      <ApiKeyManagerConsole />
    </div>
  );
}