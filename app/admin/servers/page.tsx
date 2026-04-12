import { redirect } from 'next/navigation';

export default function ServersPage() {
  redirect('/admin/infrastructure#servers');
}