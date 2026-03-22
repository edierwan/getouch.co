import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ArticleCard from '@/components/ArticleCard';
import { getArticles } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

const regionLabels = {
  malaysia: 'Malaysia',
  dunia: 'Dunia',
};

export async function generateMetadata({ params }) {
  const label = regionLabels[params.region] || params.region;
  return {
    title: `Berita ${label} — Berita Getouch`,
    description: `Berita terkini dari ${label}.`,
  };
}

export default async function RegionPage({ params }) {
  const label = regionLabels[params.region] || params.region;
  const data = await getArticles({ region: params.region, pageSize: 20 });
  const articles = data?.data || [];

  return (
    <>
      <Header />
      <main className="main">
        <div className="category-header">
          <h1>Berita {label}</h1>
          <p>Liputan terkini berita dari {label}</p>
        </div>

        {articles.length === 0 ? (
          <div className="loading">Tiada berita untuk wilayah ini buat masa ini.</div>
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
