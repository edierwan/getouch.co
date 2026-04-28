import { PageIntro } from '../ui';
import { ApiKeyManagerConsole } from './ApiKeyManagerConsole';

export const dynamic = 'force-dynamic';

export default function ApiKeysPage() {
  return (
    <div className="portal-body">
      <PageIntro
        title="API Key Manager"
        subtitle="Centralized keys, scopes, and usage across AI, Voice, WhatsApp, and internal APIs."
      />
      <ApiKeyManagerConsole />
    </div>
  );
}
