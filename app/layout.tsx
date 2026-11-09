import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, Press_Start_2P } from 'next/font/google';

import { cn } from '@/lib/utils';
import './globals.css';

/* Body text font. The variable feeds `--font-sans` in globals.css. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/* Pixel font used only for the logo, badges and highlight numbers (`font-display`). */
const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel',
  display: 'swap',
});

const SITE_URL = 'https://zerei.app';
const SITE_NAME = 'Zerei.app';
const SITE_TITLE = 'Zerei.app — your log of beaten games';
const SITE_DESCRIPTION =
  "Log every game you've ever beaten, from the rental store Master System to the PS5. Memories, scores, stats and plenty of nostalgia. Works offline and keeps everything in your browser.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s | Zerei.app',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  keywords: [
    'beaten games',
    'zerei',
    'game log',
    'game catalog',
    'retro',
    'retrogaming',
    'nostalgia',
    'Mega Drive',
    'Master System',
    'Super Nintendo',
    'Tec Toy',
    'arcade',
    'rental store',
    'backlog',
    'PlayStation 2',
    'games',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'games',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/icons/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Zerei.app — pixel art check mark on a dark background',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/icons/icon-512.png'],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn(inter.variable, pressStart.variable)} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
