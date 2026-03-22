import Link from 'next/link';
import { getCategoryLabel, getCategoryColor, timeAgo } from '@/lib/utils';

export default function ArticleCard({ article, variant = 'grid' }) {
  const attrs = article.attributes || article;
  const slug = attrs.slug;
  const coverUrl = attrs.cover_image_url ||
    attrs.cover_image?.data?.attributes?.url ||
    'https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=600&h=400&fit=crop';
  const catColor = getCategoryColor(attrs.category);

  if (variant === 'list') {
    return (
      <Link href={`/artikel/${slug}`} className="list-item">
        <div className="list-img">
          <img src={coverUrl} alt={attrs.title} loading="lazy" />
        </div>
        <div className="list-content">
          <span className="category-badge" style={{ color: catColor, borderColor: catColor }}>
            {getCategoryLabel(attrs.category)}
          </span>
          <h3>{attrs.title}</h3>
          <p className="card-excerpt">{attrs.excerpt}</p>
          <div className="meta">
            <span>{attrs.source_name}</span>
            <span className="meta-dot" />
            <span>{timeAgo(attrs.publishedAt || attrs.original_published_at)}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/artikel/${slug}`} className="article-card">
      <div className="card-img">
        <img src={coverUrl} alt={attrs.title} loading="lazy" />
      </div>
      <span className="category-badge" style={{ color: catColor, borderColor: catColor }}>
        {getCategoryLabel(attrs.category)}
      </span>
      <h3 className="card-title">{attrs.title}</h3>
      <p className="card-excerpt">{attrs.excerpt}</p>
      <div className="meta">
        <span>{attrs.source_name}</span>
        <span className="meta-dot" />
        <span>{timeAgo(attrs.publishedAt || attrs.original_published_at)}</span>
      </div>
    </Link>
  );
}
