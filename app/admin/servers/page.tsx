import { SERVER_CARDS } from '../data';
import { DetailCardGrid, PageIntro } from '../ui';

export default function ServersPage() {
  return (
    <div className="portal-body">
      <PageIntro title="Servers & Nodes" subtitle="Compute, ingress, and runtime layout for the getouch.co VPS." />
      <DetailCardGrid cards={SERVER_CARDS} />
    </div>
  );
}