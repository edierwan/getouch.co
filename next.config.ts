import type { NextConfig } from 'next';

const nextConfig: NextConfig & { allowedDevOrigins?: string[] } = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['nodemailer'],
  // Allow common local dev origins to request /_next/* without cross-origin warnings
  // allow both bare hostnames and common http origins with port used during dev
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
  ],
};

export default nextConfig;