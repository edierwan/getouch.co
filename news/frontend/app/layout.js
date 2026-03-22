import './globals.css';

export const metadata = {
  title: {
    default: 'Berita Getouch — Portal Berita Malaysia & Dunia',
    template: '%s | Berita Getouch',
  },
  description: 'Portal berita terkini Malaysia dan dunia. Liputan menyeluruh politik, bisnes, teknologi, sukan dan banyak lagi.',
  openGraph: {
    type: 'website',
    locale: 'ms_MY',
    siteName: 'Berita Getouch',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ms">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Serif:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
