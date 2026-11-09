import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/**
 * CSP without a nonce, on purpose: a nonce forces dynamic rendering on every
 * page and turns off static HTML/ISR, which is what makes the app fast
 * (Next 16 docs, "Content Security Policy > Without Nonces"). It still blocks
 * third-party scripts, frames, plugins and form posts to other origins.
 * Remote covers go through /_next/image (same origin), except IGDB and
 * Wikimedia ones, which the browser fetches directly (see CoverImage).
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
    // In dev, HSTS and upgrade-insecure-requests get in the way of LAN access by IP.
    if (isDev) return [];
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  images: {
    // Covers served by public box art CDNs. The <CoverImage /> component
    // always falls back to a locally drawn cover if the origin fails.
    // Wikimedia ones skip the optimizer entirely (see CoverImage), because a
    // burst of server requests gets 429s from there.
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
