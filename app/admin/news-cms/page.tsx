import { redirect } from 'next/navigation';

export default function NewsCmsRedirectPage() {
  redirect('http://cms.news.getouch.co/admin');
}