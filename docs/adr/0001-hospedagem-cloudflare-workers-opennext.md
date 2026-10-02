# ADR 0001 — Hospedagem em Cloudflare Workers com OpenNext

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O Zerei precisa de uma página real (HTML indexável) para cada jogo — dezenas de
milhares hoje, centenas de milhares com a IGDB — e, nas próximas fases, de
servidor para contas, imagens de compartilhamento (OG) e a busca com IA. O
projeto é gratuito e não comercial, então o custo precisa ficar em US$ 0, com
no máximo US$ 5/mês de seguro para picos.

Opções avaliadas:

1. **Cloudflare Pages com export estático.** Limite de 20 mil arquivos por
   deploy: não cabe uma página por jogo. Sem servidor para OG, contas e IA.
2. **Vercel.** Integração nativa, mas o plano gratuito limita banda (100 GB/mês),
   arriscado para um site de imagens com tráfego viral.
3. **Cloudflare Workers com o adaptador OpenNext.** Páginas geradas sob demanda
   na borda e cacheadas; assets estáticos servidos pelo CDN; mesmo código roda
   na Vercel e na AWS (OpenNext/SST).

## Decisão

Opção 3. Teste de viabilidade feito em 2026-10-02 com Next 16.3.8,
`@opennextjs/cloudflare` 1.20.7 e `wrangler` 4.146.0, rodando localmente no
`workerd`:

| Verificação | Resultado |
| --- | --- |
| `opennextjs-cloudflare build` | ok, 12,5 s |
| `GET /` (estático) | 200, 46 ms |
| `GET /api/igdb/search` (rota dinâmica) | 200, 41 ms |
| `GET /catalog/*.json` (asset) | 200, 4 ms |
| `GET /_next/image` local e remoto | 200 |
| Tamanho do Worker | 4,9 MB / **1,05 MB gzip** (limite gratuito: 3 MB) |

O adaptador exige `next >= 16.3.6`, por isso o Next subiu de 16.3.3 para 16.3.8.

## Consequências

- `npm run preview` builda e roda o Worker localmente; `npm run deploy` publica.
- O cache incremental (ISR) em R2 fica comentado em `open-next.config.ts` até a
  conta Cloudflare existir.
- Risco: o adaptador pode atrasar em relação a recursos novos do Next. Mitigação:
  versões fixadas e o build do OpenNext rodando no CI a cada PR.
- Plano B, se o adaptador travar uma atualização: export estático das páginas
  principais + um Worker separado para API, OG e páginas de jogo.
