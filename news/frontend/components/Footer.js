import Link from 'next/link';
import { getCategories } from '@/lib/api';

export default async function Footer() {
  const categories = await getCategories();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-brand">
            <h3>BERITA GETOUCH</h3>
            <p>
              Portal berita terkini Malaysia dan dunia. Liputan menyeluruh dan terpercaya
              untuk memberi anda maklumat terkini setiap hari.
            </p>
          </div>
          <div>
            <h4>Bahagian</h4>
            {categories.slice(0, 6).map((cat) => (
              <Link key={cat.slug} href={`/kategori/${cat.slug}`}>
                {cat.label}
              </Link>
            ))}
          </div>
          <div>
            <h4>Lagi</h4>
            {categories.slice(6).map((cat) => (
              <Link key={cat.slug} href={`/kategori/${cat.slug}`}>
                {cat.label}
              </Link>
            ))}
          </div>
          <div>
            <h4>Wilayah</h4>
            <Link href="/region/malaysia">Malaysia</Link>
            <Link href="/region/dunia">Dunia</Link>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} Berita Getouch. Hak cipta terpelihara.
        </div>
      </div>
    </footer>
  );
}
