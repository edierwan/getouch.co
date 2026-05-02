import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SecurityInfisicalPage() {
  permanentRedirect('https://infisical.getouch.co');
}