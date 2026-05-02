import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AiQdrantPage() {
  redirect('/admin/infra/databases?tab=qdrant');
}