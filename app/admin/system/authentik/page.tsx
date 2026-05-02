import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SystemAuthentikPage() {
  permanentRedirect('https://sso.getouch.co');
}