import { ImageResponse } from 'next/og';

import { decodeDna, eraLabel, type Dna } from '@/lib/dna';

/*
 * Imagem do Gamer DNA. `?d=` é o DNA codificado (validado por allowlist em
 * lib/dna.ts); `?f=story` dá 1080x1920 (Instagram/WhatsApp), o padrão é
 * 1200x630 (prévia de link). O conteúdo é função só da URL: cache de um ano.
 */

const NEON = '#39ff9e';
const INK = '#ecedf1';
const SOFT = '#a1a1ae';
const BG = '#09090b';
const PANEL = '#16161d';
const BAR = '#19b06a';

function Bars({ dna, scale }: { dna: Dna; scale: number }) {
  const max = Math.max(1, ...dna.consoles.map((c) => c.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 * scale, width: '100%' }}>
      {dna.consoles.map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 20 * scale }}>
          <div style={{ display: 'flex', width: 270 * scale, fontSize: 30 * scale, color: SOFT }}>{c.label}</div>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 16 * scale }}>
            <div
              style={{
                display: 'flex',
                height: 26 * scale,
                width: `${Math.max(4, (c.count / max) * 100)}%`,
                background: BAR,
                borderRadius: `0 ${6 * scale}px ${6 * scale}px 0`,
              }}
            />
            <div style={{ display: 'flex', fontSize: 30 * scale, color: INK, fontWeight: 800 }}>{c.count}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Chips({ dna, scale }: { dna: Dna; scale: number }) {
  const chips = [
    eraLabel(dna.era),
    dna.genre ? `Gênero favorito: ${dna.genre}` : null,
    dna.maker ? `${dna.maker.pct}% ${dna.maker.name}` : null,
  ].filter((c): c is string => !!c);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 * scale }}>
      {chips.map((chip) => (
        <div
          key={chip}
          style={{
            display: 'flex',
            padding: `${10 * scale}px ${20 * scale}px`,
            borderRadius: 999,
            border: `2px solid #27272f`,
            background: PANEL,
            color: INK,
            fontSize: 26 * scale,
          }}
        >
          {chip}
        </div>
      ))}
    </div>
  );
}

function Brand({ scale }: { scale: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 * scale, fontSize: 34 * scale, fontWeight: 800, color: NEON, letterSpacing: 2 }}>
      ZEREI.APP
      <div style={{ display: 'flex', fontSize: 24 * scale, color: SOFT, fontWeight: 400, letterSpacing: 4 }}>· GAMER DNA</div>
    </div>
  );
}

const frame = {
  display: 'flex',
  width: '100%',
  height: '100%',
  background: `radial-gradient(circle at 50% -10%, rgba(57,255,158,0.22), ${BG} 55%)`,
  color: INK,
  fontFamily: 'Inter',
} as const;

/*
 * Inter (subconjunto latim + acentos, ~35 KB por peso) servida como arquivo
 * estático e lida em tempo de execução, uma vez por instância: fora do limite
 * de 500 KB do bundle da imagem e do tamanho do Worker. A fonte padrão do
 * next/og só tem o peso regular — o número e o rótulo perdiam a força.
 */
let fontsPromise: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 800; style: 'normal' }[]> | null = null;

function loadFonts(origin: string) {
  fontsPromise ??= Promise.all(
    ([400, 800] as const).map(async (weight) => {
      const res = await fetch(new URL(`/fonts/inter-${weight}.ttf`, origin));
      if (!res.ok) throw new Error(`fonte inter-${weight}: HTTP ${res.status}`);
      return { name: 'Inter', data: await res.arrayBuffer(), weight, style: 'normal' as const };
    }),
  ).catch((error: unknown) => {
    fontsPromise = null; // tenta de novo na próxima requisição
    throw error;
  });
  return fontsPromise;
}

function Story({ dna }: { dna: Dna | null }) {
  if (!dna) return <Fallback vertical />;
  return (
    <div style={{ ...frame, flexDirection: 'column', padding: '110px 90px', justifyContent: 'space-between' }}>
      <Brand scale={1.2} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ display: 'flex', fontSize: 30, color: NEON, letterSpacing: 6 }}>EU SOU</div>
        <div style={{ display: 'flex', fontSize: 104, fontWeight: 800, lineHeight: 1.05 }}>{dna.archetype.label}</div>
        <div style={{ display: 'flex', fontSize: 38, color: SOFT, lineHeight: 1.35 }}>{dna.archetype.line}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28 }}>
        <div style={{ display: 'flex', fontSize: 240, fontWeight: 800, lineHeight: 0.9 }}>{dna.beaten}</div>
        <div style={{ display: 'flex', fontSize: 44, color: SOFT, paddingBottom: 22 }}>
          {dna.beaten === 1 ? 'jogo zerado' : 'jogos zerados'}
        </div>
      </div>
      {dna.consoles.length > 0 && <Bars dna={dna} scale={1.3} />}
      <Chips dna={dna} scale={1.2} />
      <div style={{ display: 'flex', fontSize: 38, color: NEON, fontWeight: 800 }}>Descubra o seu em zerei.app</div>
    </div>
  );
}

function Card({ dna }: { dna: Dna | null }) {
  if (!dna) return <Fallback />;
  return (
    <div style={{ ...frame, flexDirection: 'column', padding: '56px 64px', justifyContent: 'space-between' }}>
      <Brand scale={0.8} />
      <div style={{ display: 'flex', gap: 56, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 560, gap: 12 }}>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{dna.archetype.label}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <div style={{ display: 'flex', fontSize: 120, fontWeight: 800, lineHeight: 0.9 }}>{dna.beaten}</div>
            <div style={{ display: 'flex', fontSize: 30, color: SOFT, paddingBottom: 12 }}>
              {dna.beaten === 1 ? 'jogo zerado' : 'jogos zerados'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1 }}>{dna.consoles.length > 0 && <Bars dna={dna} scale={0.9} />}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Chips dna={dna} scale={0.8} />
        <div style={{ display: 'flex', fontSize: 26, color: NEON, fontWeight: 800 }}>zerei.app</div>
      </div>
    </div>
  );
}

/** Link sem DNA válido: convite genérico (nunca um erro feio na prévia). */
function Fallback({ vertical = false }: { vertical?: boolean }) {
  return (
    <div style={{ ...frame, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, padding: 80 }}>
      <Brand scale={vertical ? 1.4 : 1} />
      <div style={{ display: 'flex', fontSize: vertical ? 96 : 64, fontWeight: 800, textAlign: 'center' }}>
        Qual é o seu Gamer DNA?
      </div>
      <div style={{ display: 'flex', fontSize: vertical ? 40 : 30, color: SOFT, textAlign: 'center' }}>
        Marque os jogos que você zerou e descubra.
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dna = decodeDna(url.searchParams.get('d'));
  const story = url.searchParams.get('f') === 'story';
  // Sem a fonte, ainda desenha (fonte padrão) em vez de quebrar a prévia do link.
  const fonts = await loadFonts(url.origin).catch(() => undefined);
  return new ImageResponse(story ? <Story dna={dna} /> : <Card dna={dna} />, {
    width: story ? 1080 : 1200,
    height: story ? 1920 : 630,
    fonts,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
