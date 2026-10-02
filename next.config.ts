import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/**
 * CSP sem nonce, de propósito: nonce obriga renderização dinâmica em toda
 * página e desliga o HTML estático/ISR, que é a base da velocidade do app
 * (docs do Next 16, "Content Security Policy > Without Nonces"). Ainda assim
 * bloqueia script de terceiros, frames, plugins e envio de formulário para fora.
 * As capas remotas passam pelo /_next/image (mesma origem), exceto as da IGDB
 * e da Wikimedia, que o navegador busca direto (ver CoverImage).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://images.igdb.com https://upload.wikimedia.org",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    // Em dev, HSTS e upgrade-insecure-requests atrapalham o acesso por IP na rede local.
    if (isDev) return [];
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
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
