import { MESSAGING_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function MessagingPage() {
  return (
    <div className="portal-body">
      <PageIntro title="Messaging" subtitle="WhatsApp delivery, support communication, and verification messaging." />
      <ServicePanel title="MESSAGING SERVICES" rows={MESSAGING_ROWS} />
    </div>
  );
}
