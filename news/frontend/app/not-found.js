import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="main" style={{ textAlign: 'center', padding: '6rem 1rem' }}>
        <h1 style={{ fontSize: '4rem', fontWeight: 900, color: '#dc2626', marginBottom: '1rem' }}>404</h1>
        <p style={{ fontSize: '1.15rem', color: '#6b7280', marginBottom: '2rem' }}>
          Halaman yang anda cari tidak dijumpai.
        </p>
        <Link href="/" className="page-btn" style={{ display: 'inline-block' }}>
          ← Kembali ke Utama
        </Link>
      </main>
      <Footer />
    </>
  );
}
