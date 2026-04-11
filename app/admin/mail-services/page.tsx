import { MAIL_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function MailServicesPage() {
  return (
    <div className="portal-body">
      <PageIntro title="Mail Services" subtitle="Email delivery capabilities currently configured on the getouch.co stack." />
      <ServicePanel title="MAIL SERVICES" rows={MAIL_ROWS} />
    </div>
  );
}
