import { Breadcrumb, PageIntro } from '../ui';
import { AppAccessControlConsole } from './AppAccessControlConsoleSimple';

export const dynamic = 'force-dynamic';

export default function ApiKeysPage() {
  return (
    <div className="portal-body">
      <Breadcrumb category="Access & Security" page="API Keys / App Access" />
      <PageIntro
        title="App Access Control"
        subtitle="Master registry for apps, tenants, service integrations, and secret references across the shared AI ecosystem."
      />
      <AppAccessControlConsole />
    </div>
  );
}
