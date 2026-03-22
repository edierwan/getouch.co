import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ArticleCard from '@/components/ArticleCard';
import { getArticles, getCategories } from '@/lib/api';
import { getCategoryLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const label = getCategoryLabel(params.slug);
  return {
    title: `${label} — Berita Getouch`,
    description: `Berita terkini kategori ${label} dari Malaysia dan dunia.`,
  };
}

export default async function CategoryPage({ params }) {
  const label = getCategoryLabel(params.slug);
  const data = await getArticles({ category: params.slug, pageSize: 20 });
  const articles = data?.data || [];

  return (
    <>
      <Header />
      <main className="main">
        <div className="category-header">
          <h1>{label}</h1>
          <p>Berita terkini kategori {label.toLowerCase()} dari Malaysia dan dunia</p>
        </div>

        {articles.length === 0 ? (
          <div className="loading">Tiada berita dalam kategori ini buat masa ini.</div>
        ) : (
          <div className="article-grid">
            {articles.map((article) => (
              <ArticleCard key={article.id || (article.attributes || article).slug} article={article} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
