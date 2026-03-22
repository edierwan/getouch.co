import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ArticleCard from '@/components/ArticleCard';
import { getArticles } from '@/lib/api';
import { getCategoryLabel, getCategoryColor, timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export default async function HomePage() {
  const data = await getArticles({ pageSize: 20 });
  const articles = data?.data || [];

  const hero = articles[0];
  const sideArticles = articles.slice(1, 5);
  const latestArticles = articles.slice(5, 13);
  const trendingArticles = articles.slice(0, 5);

  const heroAttrs = hero?.attributes || hero || {};
  const heroCover = heroAttrs.cover_image_url ||
    heroAttrs.cover_image?.data?.attributes?.url ||
    'https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=1200&h=630&fit=crop';
  const heroColor = getCategoryColor(heroAttrs.category);

  return (
    <>
      <Header />

      {hero && (
        <div className="breaking-bar">
          <div className="breaking-inner">
            <span className="breaking-label">TERKINI</span>
            <span>{heroAttrs.title}</span>
          </div>
        </div>
      )}

      <main className="main">
        {/* Hero Grid */}
        {hero && (
          <div className="hero-grid">
            <Link href={`/artikel/${heroAttrs.slug}`} className="hero-main">
              <img src={heroCover} alt={heroAttrs.title} />
              <div className="hero-overlay">
                <span className="category-badge" style={{ background: heroColor, color: '#fff', border: 'none' }}>
                  {getCategoryLabel(heroAttrs.category)}
                </span>
                <h2>{heroAttrs.title}</h2>
                <div className="meta">
                  <span>{heroAttrs.source_name}</span>
                  <span className="meta-dot" style={{ background: 'rgba(255,255,255,0.5)' }} />
                  <span>{timeAgo(heroAttrs.publishedAt || heroAttrs.original_published_at)}</span>
                </div>
              </div>
            </Link>
            <div className="hero-sidebar">
              {sideArticles.map((article) => {
                const a = article.attributes || article;
                const cover = a.cover_image_url || a.cover_image?.data?.attributes?.url || 'https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=300&h=200&fit=crop';
                const color = getCategoryColor(a.category);
                return (
                  <Link key={article.id || a.slug} href={`/artikel/${a.slug}`} className="hero-side-card">
                    <div className="hero-side-img">
                      <img src={cover} alt={a.title} loading="lazy" />
                    </div>
                    <div className="hero-side-content">
                      <span className="category-badge" style={{ color, borderColor: color, fontSize: '0.6rem' }}>
                        {getCategoryLabel(a.category)}
                      </span>
                      <h3>{a.title}</h3>
                      <div className="meta">
                        <span>{a.source_name}</span>
                        <span className="meta-dot" />
                        <span>{timeAgo(a.publishedAt || a.original_published_at)}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="two-col">
          <div>
            {/* Latest */}
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Berita Terkini</h2>
                <Link href="/kategori/politics" className="section-more">Lihat Semua →</Link>
              </div>
              <div className="article-grid">
                {latestArticles.map((article) => (
                  <ArticleCard key={article.id || (article.attributes || article).slug} article={article} />
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside>
            <div className="sidebar-section">
              <h3>Trending</h3>
              {trendingArticles.map((article, i) => {
                const a = article.attributes || article;
                return (
                  <Link key={article.id || a.slug} href={`/artikel/${a.slug}`} className="trending-item">
                    <span className="trending-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="trending-title">{a.title}</span>
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </>
  );
}
