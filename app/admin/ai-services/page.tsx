import { PageIntro } from '../ui';
import { AiServicesConsole } from './AiServicesConsole';

export const dynamic = 'force-dynamic';

export default function AiServicesPage() {
  return (
    <div className="portal-body">
      <PageIntro title="AI Services" subtitle="AI portal, inference, search augmentation, and automation services." />
      <AiServicesConsole />
    </div>
  );
}
