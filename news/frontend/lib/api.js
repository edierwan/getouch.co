const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || 'http://news-cms:1337';

async function fetchAPI(path, params = {}) {
  const url = new URL(`/api${path}`, STRAPI_URL);
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
  });

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getArticles({ page = 1, pageSize = 12, category, region, locale } = {}) {
  const params = {
    'sort[0]': 'publishedAt:desc',
    'pagination[page]': page,
    'pagination[pageSize]': pageSize,
    'filters[status][$eq]': 'published',
    'populate': '*',
  };
  if (category) params['filters[category][$eq]'] = category;
  if (region) params['filters[region][$eq]'] = region;
  if (locale) params['filters[language][$eq]'] = locale;

  return fetchAPI('/articles', params);
}

export async function getArticleBySlug(slug) {
  const params = {
    'filters[slug][$eq]': slug,
    'filters[status][$eq]': 'published',
    'populate': '*',
  };
  const data = await fetchAPI('/articles', params);
  return data?.data?.[0] || null;
}

export async function getCategories() {
  return [
    { slug: 'politics', label: 'Politik', labelEn: 'Politics' },
    { slug: 'business', label: 'Bisnes', labelEn: 'Business' },
    { slug: 'technology', label: 'Teknologi', labelEn: 'Technology' },
    { slug: 'sports', label: 'Sukan', labelEn: 'Sports' },
    { slug: 'entertainment', label: 'Hiburan', labelEn: 'Entertainment' },
    { slug: 'world', label: 'Dunia', labelEn: 'World' },
    { slug: 'lifestyle', label: 'Gaya Hidup', labelEn: 'Lifestyle' },
    { slug: 'health', label: 'Kesihatan', labelEn: 'Health' },
    { slug: 'education', label: 'Pendidikan', labelEn: 'Education' },
    { slug: 'crime', label: 'Jenayah', labelEn: 'Crime' },
    { slug: 'environment', label: 'Alam Sekitar', labelEn: 'Environment' },
    { slug: 'opinion', label: 'Pendapat', labelEn: 'Opinion' },
  ];
}
