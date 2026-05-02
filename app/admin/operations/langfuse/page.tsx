import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LangfuseOperationsPage() {
  permanentRedirect('https://langfuse.getouch.co');
}