# ADR 0003 — Orçamentos de performance com catraca no CI

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

Velocidade é o produto: o Zerei precisa parecer instantâneo num Android
intermediário em 4G, que é o aparelho típico do público no Brasil. Orçamento que
não reprova build vira decoração.

## Decisão

Três travas no CI (`.github/workflows/ci.yml`):

1. **Teste de desempenho do clique em "Zerei!"** (`lib/games.perf.test.ts`), com
   o catálogo completo: ≤ 10 ms na máquina de CI (≈ 50 ms num Android
   intermediário) e lista idêntica à do caminho completo.
2. **Tamanho do Worker** ≤ 3 MB gzip (limite do plano gratuito da Cloudflare).
3. **Lighthouse CI** (`lighthouserc.json`, perfil móvel, mediana de 3 execuções).

### Catraca

Os limites do Lighthouse partem da linha de base medida e só sobem: nenhum PR
pode piorar, e cada melhoria aperta o limite no mesmo PR.

Linha de base (2026-10-02, build de produção, perfil móvel do Lighthouse 12):

| Página | Perf | A11y | Boas práticas | SEO | FCP | LCP | TBT | CLS | Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 78 | 100 | 100 | 100 | 0,8 s | 2,6 s | 800 ms | 0 | 2,5 MB |
| `/?console=snes` | 88 | 100 | 100 | 100 | 0,8 s | 2,5 s | 400 ms | 0 | 2,5 MB |

### Erro ou aviso

O primeiro run no GitHub (PR #1) mostrou que o runner é ~2–4x mais lento que a
máquina de desenvolvimento e **muito instável**: a mesma página teve nota 0,44,
0,66 e 0,68 em três execuções seguidas, com LCP de até 12,9 s e TBT de 3,9 s.
Trava que passa ou falha por sorte ensina o time a ignorá-la. Então:

- **Erro (determinístico):** acessibilidade = 100, boas práticas ≥ 95, SEO ≥ 95,
  CLS ≤ 0,02 e bytes transferidos ≤ 2,7 MB.
- **Aviso (depende da CPU do runner):** nota de performance, LCP e TBT.

Os avisos voltam a ser erro quando a Fase 2 tirar o processamento do catálogo
da thread principal; sem esse trabalho de CPU, a variação do runner cai.

O número do runner também é um dado real: numa CPU lenta, como a de um Android
barato, o app trava a tela por quase 4 s processando os 57 mil jogos. É a
prioridade número um da Fase 2.

### Catraca apertada na Fase 1 (2026-10-02)

Catálogo 2,5x maior (145 mil jogos) e, mesmo assim, melhor: a primeira tela
baixa só os mais populares (`top.json`, ~84 KB) e cada console sob demanda.

| Página | Perf | A11y | LCP | TBT | CLS | Bytes |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 94 | 100 | 2,7 s | 160–180 ms | 0 | 1,1 MB |
| `/?console=snes` | 95 | 100 | 2,7 s | 120–130 ms | 0 | 1,7 MB |

Novos limites: bytes ≤ 2,0 MB (erro); nota ≥ 0,85 e TBT ≤ 400 ms (aviso, com
folga para o runner).

### Metas (Fase 2)

| Métrica | Meta |
| --- | --- |
| LCP (p75 de campo, móvel) | ≤ 1,8 s |
| INP (p75) / clique em "Zerei!" | ≤ 100 ms / ≤ 50 ms |
| CLS | ≤ 0,02 |
| JS inicial | ≤ 110 KB br |
| Primeira carga de uma página de console | ≤ 300 KB e ≤ 25 requisições |

O que separa a linha de base das metas é conhecido: o app baixa e processa os
57 mil jogos (2,5 MB) na thread principal. A Fase 2 resolve com catálogo
fatiado por console, Web Worker para busca e grade virtualizada.

## Consequências

- Regressão de performance aparece no PR, com relatório do Lighthouse.
- A página pública `/status` (Fase 2) vai mostrar os números de campo (RUM)
  ao lado destes, de laboratório.
