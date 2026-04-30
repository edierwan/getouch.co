import { McpServiceEndpointConsole } from './McpServiceEndpointConsole';

export const dynamic = 'force-dynamic';

export default function McpServiceEndpointPage() {
  return (
    <div className="portal-body">
      <McpServiceEndpointConsole />
    </div>
  );
}