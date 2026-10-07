import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@ledgerly/contracts'],
};

export default nextConfig;
