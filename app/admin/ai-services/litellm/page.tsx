import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AiServicesLiteLlmPage() {
	redirect('https://litellm.getouch.co');
}