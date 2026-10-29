import type { NextConfig } from 'next';

// A static export, served by sirv on Railway: no server, no image optimiser.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: ['@esmart/core', '@esmart/i18n', '@esmart/ui'],
};

export default config;
