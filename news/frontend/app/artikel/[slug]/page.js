import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ArticleCard from '@/components/ArticleCard';
import { getArticleBySlug, getArticles } from '@/lib/api';
import { getCategoryLabel, getCategoryColor, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const article = await getArticleBySlug(params.slug);
  if (!article) return { title: 'Artikel Tidak Dijumpai' };
  const a = article.attributes || article;
  return {
    title: a.title,
    description: a.excerpt || a.ai_summary,
    openGraph: {
      title: a.title,
      description: a.excerpt,
      images: [a.cover_image_url || ''],
    },
  };
}

export default async function ArticlePage({ params }) {
  const article = await getArticleBySlug(params.slug);
  if (!article) notFound();

  const a = article.attributes || article;
  const coverUrl = a.cover_image_url ||
    a.cover_image?.data?.attributes?.url ||
    'https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=1200&h=630&fit=crop';
  const catColor = getCategoryColor(a.category);

  // Related articles
  const relatedData = await getArticles({ category: a.category, pageSize: 4 });
  const related = (relatedData?.data || []).filter((r) => {
    const ra = r.attributes || r;
    return ra.slug !== a.slug;
  }).slice(0, 3);

  return (
    <>
      <Header />
      <article className="article-page">
        <Link href="/" className="back-link">← Kembali ke Utama</Link>

        <span className="category-badge" style={{ color: catColor, borderColor: catColor }}>
          {getCategoryLabel(a.category)}
        </span>

        <h1>{a.title}</h1>

        {a.excerpt && <p className="article-excerpt">{a.excerpt}</p>}

        <div className="article-meta">
          <span>{a.source_name || 'Berita Getouch'}</span>
          <span className="meta-dot" />
          <span>{formatDate(a.publishedAt || a.original_published_at)}</span>
          {a.region && (
            <>
              <span className="meta-dot" />
              <span style={{ textTransform: 'capitalize' }}>{a.region}</span>
            </>
          )}
        </div>

        <div className="article-cover">
          <img src={coverUrl} alt={a.title} />
        </div>

        {a.ai_summary && (
          <div className="ai-summary">
            <div className="ai-summary-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              Ringkasan AI
            </div>
            <p>{a.ai_summary}</p>
          </div>
        )}

        <div
          className="article-body"
          dangerouslySetInnerHTML={{ __html: a.content_html || '' }}
        />

        {related.length > 0 && (
          <section className="section" style={{ marginTop: '3rem' }}>
            <div className="section-header">
              <h2 className="section-title">Berita Berkaitan</h2>
            </div>
            <div className="article-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {related.map((r) => (
                <ArticleCard key={r.id || (r.attributes || r).slug} article={r} />
              ))}
            </div>
          </section>
        )}
      </article>
      <Footer />
    </>
  );
}
