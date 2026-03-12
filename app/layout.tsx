import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://getouch.co'),
  title: 'Getouch — AI Platform',
  description:
    'Getouch is a self-hosted AI platform with chat, image generation, document analysis, web search, and autonomous agents — all running on your own GPU infrastructure.',
  openGraph: {
    title: 'Getouch — AI Platform',
    description:
      'Self-hosted AI platform: chat, image generation, document AI, web search, and agents on your own GPU.',
    url: 'https://getouch.co',
    siteName: 'Getouch'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Getouch — AI Platform',
    description:
      'Self-hosted AI platform: chat, image generation, document AI, web search, and agents on your own GPU.'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}