import { REVERSE_PROXY_ROWS } from '../data';
import { PageIntro, ServicePanel } from '../ui';

export default function ReverseProxyPage() {
  return (
    <div className="portal-body">
      <PageIntro title="Reverse Proxy" subtitle="Ingress, SSL, and routing layers exposed by the getouch.co infrastructure." />
      <ServicePanel title="PROXY STACK" rows={REVERSE_PROXY_ROWS} />
    </div>
  );
}