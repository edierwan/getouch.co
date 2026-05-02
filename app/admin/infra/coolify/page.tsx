import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function InfraCoolifyPage() {
  permanentRedirect('https://coolify.getouch.co');
}