import { OpenClawBootstrapPage, requireOpenClawHost } from '../openclaw/bootstrap';

export const dynamic = 'force-dynamic';

export default async function OpenClawConnectPage() {
  await requireOpenClawHost();

  return (
    <OpenClawBootstrapPage
      title="OpenClaw - Connecting"
      message="Connecting to OpenClaw..."
      script="window.location.replace('/chat?session=main');"
    />
  );
}