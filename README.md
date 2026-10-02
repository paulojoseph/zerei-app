# Zerei.app

**Seu diário de jogos zerados.** Um catálogo pessoal para registrar tudo que você zerou na vida — do Master System da locadora ao PS5 — com o ano em que zerou, a nota que você daria e aquela anotação que só faz sentido pra você.

Não é rede social, não tem login e nada sai do seu navegador. É a estante de jogos zerados que você nunca teve.

`Next.js 16` · `React 19` · `TypeScript 5.9 (strict)` · `Tailwind CSS v4` · `Zustand 5` · `PWA` · `100% pt-BR`

---

## Como rodar

Requer **Node.js 20.9 ou superior**.

```bash
npm install
npm run dev
```

Abra **http://localhost:3000**.

Não precisa de banco de dados, conta, chave de API nem internet: o app já vem com a base de jogos embutida.

---

## Onde ficam os seus dados

O catálogo é estático: a curadoria em `data/seed-games.json` e o catálogo completo por console em `public/catalog/` (gerado por `npm run catalog`, veja abaixo). Todo o seu progresso — status, ano em que zerou, nota e anotações — é gravado no **LocalStorage do navegador**, na chave `zerei-app-storage`.

Isso significa que:

- nenhum dado é enviado para servidor nenhum;
- os registros são por navegador e por dispositivo (o que você marcou no celular não aparece no desktop);
- limpar os dados do site, usar aba anônima ou trocar de navegador **apaga tudo**.

Por isso o backup abaixo não é enfeite.

---

## Backup

No cabeçalho, o menu de backup permite:

- **Exportar JSON** — arquivo completo (progresso + jogos adicionados manualmente). É este o arquivo que restaura tudo depois.
- **Exportar CSV** — mesma informação em formato de planilha, para abrir no Excel/Google Sheets. Serve para consultar e imprimir, não para restaurar.
- **Importar** — escolha um JSON exportado pelo próprio app, em um dos dois modos:
  - **Mesclar** (padrão): junta com o que já existe; em caso de conflito no mesmo jogo, vence o registro mais recente;
  - **Substituir**: descarta o que está no navegador e fica só com o conteúdo do arquivo.

Dica: exporte um JSON de vez em quando e guarde junto das suas fotos. É um arquivo de texto de alguns KB.

---

## IGDB (opcional)

A busca funciona sem nada configurado, pesquisando na base local. Se você quiser também procurar jogos que não estão na base, dá para ligar a **IGDB** (a API de jogos da Twitch):

1. Crie um aplicativo em <https://dev.twitch.tv/console/apps> (URL de redirecionamento pode ser `http://localhost:3000`).
2. Copie o arquivo de exemplo:
   ```bash
   cp .env.example .env.local
   ```
3. Preencha as duas variáveis com os dados do app que você criou:
   ```
   TWITCH_CLIENT_ID=seu_client_id
   TWITCH_CLIENT_SECRET=seu_client_secret
   ```
4. **Reinicie o servidor de desenvolvimento** (`Ctrl+C` e `npm run dev` de novo) — o Next.js só lê as variáveis de ambiente na inicialização.

Sem as credenciais, a rota `/api/igdb/search` simplesmente responde com resultados da base local e um aviso. Nada quebra.

---

## Decisões de arquitetura

As decisões importantes ficam registradas em [`docs/adr/`](docs/adr/):

- [0001 — Hospedagem em Cloudflare Workers com OpenNext](docs/adr/0001-hospedagem-cloudflare-workers-opennext.md)
- [0002 — IDs estáveis para os jogos](docs/adr/0002-ids-estaveis.md)
- [0003 — Orçamentos de performance com catraca no CI](docs/adr/0003-orcamentos-de-performance.md)
- [0004 — IGDB como fonte principal e o modelo Obra/Edição](docs/adr/0004-dados-igdb-modelo-edicao.md)
- [0005 — Um card por jogo](docs/adr/0005-um-card-por-jogo.md)

---

## Estrutura de pastas

```
zerei-app/
├── app/
│   ├── api/igdb/search/        # rota da busca online opcional (IGDB via Twitch OAuth)
│   ├── globals.css             # design system: tokens @theme, utilitários e animações
│   ├── layout.tsx              # fontes, metadata, PWA, <html lang="pt-BR">
│   └── page.tsx                # monta Header + Filters + GameGrid + modais
├── components/
│   ├── ui/                     # Button, CoverImage, Modal, StarRating
│   ├── Header.tsx              # logo, busca, contador de zerados, backup, estatísticas
│   ├── Filters.tsx             # fabricante/console, chips de status, preset BR, ordenação
│   ├── GameGrid.tsx            # grade responsiva + estados de vazio e de carregamento
│   ├── GameCard.tsx            # capa, badge da plataforma e o botão "Zerei!"
│   ├── GameModal.tsx           # memória afetiva: status, ano, nota e anotações
│   ├── StatsModal.tsx          # painel de estatísticas
│   └── Toaster.tsx             # avisos curtos no rodapé
├── data/
│   ├── seed-games.json         # curadoria: jogos com resumo, capa local e flag Nostalgia BR
│   ├── consoles.json           # consoles do filtro e de onde vem a lista de cada um
│   ├── catalog-index.json      # quantos jogos cada console tem (gerado)
│   └── cover-sources.json      # títulos na Wikipédia usados por `npm run covers`
├── lib/
│   ├── utils.ts                # cn, normalize, slugify, formatDate, debounce...
│   ├── platforms.ts            # gerações, status, apelidos e siglas de plataforma
│   ├── consoles.ts             # tabela de consoles + contagens do catálogo
│   ├── catalog.ts              # baixa public/catalog/*.json e monta os jogos
│   ├── games.ts                # carga da seed, busca tolerante, filtro e ordenação
│   ├── stats.ts                # computeStats(): números do painel de estatísticas
│   └── backup.ts               # exportar/importar JSON e CSV
├── public/
│   ├── manifest.json           # manifesto do PWA
│   ├── catalog/                # catálogo completo, um JSON por console (gerado)
│   ├── covers/                 # capas da curadoria, servidas localmente
│   └── icons/                  # icon.svg, maskable.svg e os PNGs gerados
├── scripts/
│   ├── fetch-covers.mjs        # resolve as capas da curadoria na Wikipédia
│   ├── download-covers.mjs     # baixa as capas da curadoria para public/covers
│   └── gen-icons.mjs           # gera os PNGs do PWA
├── stores/
│   └── useGameStore.ts         # Zustand + persist (LocalStorage)
└── types/
    └── game.ts                 # Game, UserGameProgress, filtros, backup e estatísticas
```

---

## Funcionalidades

- **Catálogo completo por console** — do Atari 2600 ao PS5 e Switch 2, dezenas de milhares de jogos, cada um com capa.
- **Filtro por fabricante e console** — Nintendo, Sony, Sega, Microsoft…; um clique no fabricante mostra todos os consoles dele, outro escolhe o console. Link direto: `/?console=snes` (ids em `data/consoles.json`).
- **Busca tolerante** — sem acento e por apelido: `megadrive`, `genesis`, `snes`, `fliperama`, `nintendinho` e `psx` encontram o que você espera.
- **Filtros de status** — Todos, Zerei!, Jogando, Fila e Não jogados.
- **Preset "Clássicos de Locadora & Brasil"** — um clique e sobra só o que rodava no Mega Drive da Tec Toy, no fliperama da esquina e na locadora do bairro.
- **Card com toggle "Zerei!"** — marcar um jogo como zerado é um toque, direto na grade, sem abrir nada.
- **Modal de memória afetiva** — status, ano em que você zerou, nota de 1 a 5 estrelas e um campo livre de anotações ("zerei na casa do meu primo, madrugada de sábado").
- **Painel de estatísticas** — total de zerados, distribuição por geração e plataforma, nota média, zeradas por ano e a linha do tempo das suas últimas conquistas.
- **Ordenação** — atualizados primeiro, título, ano de lançamento (novos ou antigos) e melhor nota.
- **Backup completo** — exportação em JSON e CSV, importação com mesclagem ou substituição.
- **Busca online opcional** — jogos vindos da IGDB entram no seu catálogo e viajam junto no backup.
- **PWA instalável** — abre em tela cheia, com ícone próprio, e continua funcionando sem rede.

---

## PWA — instalar na tela inicial

O app tem manifesto e ícones, então dá para instalar como um aplicativo de verdade:

- **Android (Chrome)** — menu `⋮` → **Instalar aplicativo** (ou "Adicionar à tela inicial").
- **iPhone / iPad (Safari)** — botão **Compartilhar** → **Adicionar à Tela de Início**.
- **Desktop (Chrome/Edge)** — ícone de instalar na barra de endereço, à direita.

Instalado, ele abre sem barra de navegador, no tema escuro, e ganha dois atalhos rápidos: **Zerados** e **Nostalgia BR**.

Os ícones vetoriais (`icon.svg` e `maskable.svg`) são a arte de referência; os PNGs exigidos pelo Android e pelo iOS saem de `npm run icons`. Se `public/icons/` estiver só com os SVGs, rode esse comando uma vez.

---

## Scripts npm

| Script | O que faz |
| --- | --- |
| `npm run dev` | Sobe o servidor de desenvolvimento em http://localhost:3000 |
| `npm run build` | Build de produção |
| `npm run start` | Serve o build de produção (rode `build` antes) |
| `npm run lint` | ESLint com a configuração do Next.js |
| `npm run typecheck` | `tsc --noEmit` — checagem de tipos em modo strict |
| `npm test` | Vitest: backup, busca, aliases de ID e o teste de desempenho do clique em "Zerei!" com o catálogo completo |
| `npm run preview` | Builda com OpenNext e roda o Worker localmente no `workerd` (runtime da Cloudflare) |
| `npm run deploy` | Builda e publica na Cloudflare (precisa de conta e `wrangler login`) |
| `npm run icons` | Gera os PNGs do PWA em `public/icons/` |
| `npm run catalog` | Regera o catálogo a partir da IGDB (`public/catalog/`). Aceita `-- --only=nes,snes` e `-- --fresh` |
| `npm run covers` | Busca na Wikipédia as capas da curadoria que ainda estão sem `coverUrl` e baixa para `public/covers/` |
| `npm run covers:all` | Revalida a capa de **todos** os jogos da curadoria |
| `npm run covers:download` | Só baixa para `public/covers/` as capas que ainda apontam para fora |

---

## De onde vem o catálogo

`npm run catalog` (`pipeline/build.mts`, [ADR 0004](docs/adr/0004-dados-igdb-modelo-edicao.md)) monta o catálogo a partir da [IGDB](https://www.igdb.com) — uso gratuito e não comercial, com crédito. Precisa de `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` no `.env.local` (passo a passo no topo do `.env.example`).

- **Um card por jogo** ([ADR 0005](docs/adr/0005-um-card-por-jogo.md)): o usuário marca que zerou o jogo, em qualquer plataforma; as plataformas viram tags. O console do Zerei pode juntar plataformas da IGDB (NES = NES + Famicom).
- **Só o que é um jogo:** principal, remake, remaster, port, expanded e standalone. DLC, bundle, mod e episódio ficam de fora.
- **Relançamento não é edição:** jogo muito anterior ao console (Virtual Console, PS one Classics, Arcade Archives) não entra na lista daquele console.
- **Popularidade** (visitas na IGDB + avaliações) ordena o clássico antes do obscuro. No PC entram só jogos com avaliação (são 180 mil no total).
- **IDs estáveis** ([ADR 0002](docs/adr/0002-ids-estaveis.md)): edição que casa com um jogo do catálogo anterior herda o ID dele; duplicatas regionais ("Rockman 5" = "Mega Man 5") viram alias e o progresso migra; o que a IGDB não tem continua com a fonte antiga.
- **Saída:** `public/catalog/<console>.json` (lista enxuta), `top.json` (os mais populares, para a primeira tela), `meta.json` (gêneros em PT-BR) e, fora do git, `.cache/pipeline/details/` (resumo, empresas, jogos similares, IDs externos — base das próximas fases).

As respostas da IGDB ficam em cache em `.cache/igdb/`: rodar de novo leva segundos. `--only=nes,snes` gera só alguns consoles; `--fresh` ignora o cache; `--allow-removals` aceita, de propósito, que um ID publicado suma.

O app baixa sob demanda: a primeira tela só traz `top.json` (~84 KB); cada console chega quando é escolhido ou quando o usuário tem jogos marcados nele.

---

## Como adicionar mais jogos

A base fica em **`data/seed-games.json`**: um array de objetos, um por jogo. Adicione o seu no final do arquivo e recarregue a página.

```json
{
  "id": "sonic-2-md",
  "title": "Sonic the Hedgehog 2",
  "platform": "Mega Drive",
  "category": "16-bit",
  "releaseYear": 1992,
  "coverUrl": "",
  "summary": "A dupla Sonic e Tails contra o Death Egg do Dr. Robotnik.",
  "isBrazilClassic": true,
  "genres": ["Plataforma", "Ação"]
}
```

| Campo | Obrigatório | Observações |
| --- | --- | --- |
| `id` | sim | Único no arquivo inteiro. Use algo estável, tipo `titulo-plataforma` — é a chave do seu progresso no LocalStorage. **Nunca mude o `id` de um jogo já publicado**, ou quem já zerou perde o registro. |
| `title` | sim | Nome como as pessoas procuram. |
| `platform` | sim | De preferência um dos nomes canônicos já usados em `lib/platforms.ts` (`Mega Drive`, `Master System`, `Super Nintendo`, `PlayStation 2`...), assim o jogo herda a sigla do badge e os apelidos de busca. |
| `category` | sim | Um de `"8-bit"`, `"16-bit"`, `"32/64-bit"`, `"128-bit"` ou `"modern"`. Valor fora dessa lista faz a linha ser descartada silenciosamente. |
| `releaseYear` | sim | Número, sem aspas. |
| `coverUrl` | sim | URL https da capa, ou `""`. Vazio não é problema: o app desenha uma capa própria com o título e a cor da geração. |
| `summary` | não | Uma ou duas frases em pt-BR. |
| `isBrazilClassic` | não | `true` marca o jogo como clássico de locadora/fliperama/Tec Toy e o inclui no preset **Nostalgia BR**. |
| `genres` | não | Array de strings; entra no índice de busca. |

Dois detalhes que economizam tempo:

- Se apontar `coverUrl` para um domínio novo, adicione o host em `remotePatterns` no `next.config.ts` — o `next/image` bloqueia origens não declaradas.
- Em vez de caçar capa na mão, cadastre o título da Wikipédia em `data/cover-sources.json` e rode `npm run covers`.

---

Feito para quem ainda lembra do cheiro da fita e do barulho do fliperama. **Bom jogo — e boa zerada.**
