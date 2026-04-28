import { VllmServiceEndpointConsole } from './VllmServiceEndpointConsole';

export const dynamic = 'force-dynamic';

export default function VllmServiceEndpointPage() {
  return (
    <div className="portal-body">
      <VllmServiceEndpointConsole />
    </div>
  );
}