# ADR 0002 — IDs estáveis para os jogos

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O progresso do usuário ("zerei", nota, anotações) é guardado por ID de jogo.
Até aqui o ID era derivado do título (`snes--chrono-trigger`): qualquer
correção de título na fonte, troca de fonte (libretro/Wikidata → IGDB) ou
fusão de duplicatas regionais mudaria o ID e deixaria o progresso órfão, sem
erro nenhum — o jogo só "desmarcaria" sozinho.

## Decisão

1. **O ID é cunhado uma vez e nunca recalculado.** `data/id-map.json` guarda,
   por console, `chave de origem → ID`. Chaves de origem: `lr:<título
   normalizado>` (libretro) e `wd:<item do Wikidata>` (moderno); na Fase 1
   entram as chaves da IGDB.
2. **IDs já publicados foram adotados como estão** (57.579 de 57.579
   preservados na migração). Jogos novos recebem `g_` + 8 caracteres
   aleatórios, sem significado.
3. **A trava:** o build do catálogo falha se um ID que já esteve no `id-map`
   não aparecer na saída nem tiver alias em `data/id-aliases.json`
   (`idAntigo → idNovo`). A publicação é atômica: bloqueado, nada é gravado.
   `--allow-removals` existe para remoções conscientes.
4. **O app reaponta o progresso pelos aliases** (`lib/aliases.ts`) em toda
   leitura do LocalStorage e em toda importação de backup. Em fusões, vence o
   registro mais recente.

## Consequências

- Fusões de duplicatas (Rockman 2 → Mega Man 2) viram uma linha em
  `id-aliases.json`, sem perda para ninguém.
- `data/id-map.json` cresce para sempre (3,4 MB hoje, texto com uma chave por
  linha — diffs legíveis no PR). Não vai para o navegador.
- O modelo Obra/Edição/Lançamento da Fase 1 parte daqui: o ID estável é o da
  **Edição** (jogo × plataforma), que é onde o usuário marca "zerei".
