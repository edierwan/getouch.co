import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ObservabilityLangfusePage() {
  permanentRedirect('https://langfuse.getouch.co');
}