import Link from 'next/link';
import { getCategories } from '@/lib/api';
import { getCategoryColor, getCategoryLabel } from '@/lib/utils';

export default async function Header() {
  const categories = await getCategories();

  const now = new Date();
  const dateStr = now.toLocaleDateString('ms-MY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="logo">
            <span className="logo-accent">BERITA</span>
            <span>GETOUCH</span>
          </Link>
          <span className="header-date">{dateStr}</span>
        </div>
      </header>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-link">Utama</Link>
          <Link href="/region/malaysia" className="nav-link">Malaysia</Link>
          <Link href="/region/dunia" className="nav-link">Dunia</Link>
          {categories.slice(0, 8).map((cat) => (
            <Link key={cat.slug} href={`/kategori/${cat.slug}`} className="nav-link">
              {cat.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
