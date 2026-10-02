import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, Press_Start_2P } from 'next/font/google';

import { cn } from '@/lib/utils';
import './globals.css';

/* Corpo de texto do app. A variável alimenta `--font-sans` no globals.css. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/* Fonte pixel usada só em logo, badges e números de destaque (`font-display`). */
const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-pixel',
  display: 'swap',
});

const SITE_URL = 'https://zerei.app';
const SITE_NAME = 'Zerei.app';
const SITE_TITLE = 'Zerei.app — seu diário de jogos zerados';
const SITE_DESCRIPTION =
  'Catalogue todos os jogos que você zerou na vida, do Master System da locadora ao PS5. Memórias afetivas, notas, estatísticas e muita nostalgia — funciona offline e guarda tudo no seu navegador.';

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
    'jogos zerados',
    'zerei',
    'diário de jogos',
    'catálogo de jogos',
    'retrô',
    'retrogaming',
    'nostalgia',
    'Mega Drive',
    'Master System',
    'Super Nintendo',
    'Tec Toy',
    'fliperama',
    'locadora',
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
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/icons/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Zerei.app — check em pixel art sobre fundo escuro',
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

/**
 * `data-returning`: já usou o app (onboarding feito ou jogos marcados).
 * `data-deeplink`: chegou por um link com filtro (?console=, ?q=, ?status=, ?preset=).
 */
const PRE_PAINT = `try{var d=document.documentElement,s=JSON.parse(localStorage.getItem('zerei-app-storage')||'null'),t=s&&s.state;if(t&&(t.onboardingDone||Object.keys(t.progress||{}).length))d.dataset.returning='1';if(/[?&](console|q|status|preset)=/.test(location.search))d.dataset.deeplink='1'}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={cn(inter.variable, pressStart.variable)} suppressHydrationWarning>
      <head>
        {/* Roda antes da primeira pintura (mesma técnica do "flash" de tema): o
            HTML estático não sabe se a pessoa é nova ou se veio por um link com
            filtro, e esconder a vitrine/onboarding só depois da hidratação
            empurrava a página inteira (CLS 0,66 no Lighthouse). */}
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
        {/* As capas vêm direto do CDN da IGDB: abrir a conexão (DNS + TCP + TLS)
            em paralelo com o resto tira essa espera do caminho do LCP. */}
        <link rel="preconnect" href="https://images.igdb.com" />
        <link rel="dns-prefetch" href="https://images.igdb.com" />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
