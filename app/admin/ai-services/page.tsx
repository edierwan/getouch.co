import { AI_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function AiServicesPage() {
  return (
    <div className="portal-body">
      <PageIntro title="AI Services" subtitle="AI portal, inference, search augmentation, and automation services." />
      <ServicePanel title="AI & AUTOMATION" rows={AI_ROWS} />
    </div>
  );
}
