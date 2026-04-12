import { redirect } from 'next/navigation';

export default function ReverseProxyPage() {
  redirect('/admin/infrastructure#reverse-proxy');
}