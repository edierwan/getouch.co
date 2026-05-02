import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ObservabilityGrafanaPage() {
  permanentRedirect('https://grafana.getouch.co');
}