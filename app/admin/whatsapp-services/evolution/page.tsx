import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function EvolutionPage() {
  redirect('/admin/communications/evolution');
}
