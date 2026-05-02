import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AiDifyRedirectPage() {
	redirect('https://dify.getouch.co/apps');
}