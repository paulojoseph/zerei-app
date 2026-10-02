import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Capas servidas por CDNs publicas de box art. O componente <CoverImage />
    // sempre degrada para uma capa gerada localmente caso a origem falhe.
    // As da Wikimedia nem passam pelo otimizador (ver CoverImage): a rajada de
    // requisições do servidor toma 429 de lá.
    remotePatterns: [
      { protocol: 'https', hostname: 'thumbnails.libretro.com' },
      { protocol: 'https', hostname: 'images.igdb.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'cdn.cloudflare.steamstatic.com' },
      { protocol: 'https', hostname: 'shared.cloudflare.steamstatic.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
