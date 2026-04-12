import { redirect } from 'next/navigation';

export default function DatabasesPage() {
  redirect('/admin/infrastructure#databases');
}