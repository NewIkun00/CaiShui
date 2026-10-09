import type { NextConfig } from 'next';

const apiOrigin = (process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:3001').replace(/\/$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@ledgerly/contracts'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
