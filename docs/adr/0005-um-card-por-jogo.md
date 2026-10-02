# ADR 0005 — Um card por jogo (substitui a marcação por edição do ADR 0004)

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O ADR 0004 adotou a Edição (jogo × console) como unidade de "zerei". Na prática
isso enche a tela de repetições — GTA V aparecia cinco vezes, uma por console —
e obriga o jogador a escolher em qual edição marcar. Decisão do produto: o
jogador marca que zerou **o jogo**, independentemente da plataforma.

## Decisão

1. **Unidade = obra** (um `game` da IGDB). Um card por jogo, com as plataformas
   como tags (selo "MULTI" no card quando há mais de uma). Remakes e remasters
   continuam sendo jogos diferentes (são outro `game` na IGDB).
2. **ID da obra:** jogo da curadoria → ID da curadoria; senão, o ID já
   publicado da edição no **console original** (o mais antigo). As demais
   edições viram alias. Resultado: 78.984 obras, 52.676 edições fundidas por
   alias, 4 IDs novos — nenhum progresso perdido.
3. **Fusão de progresso:** quando várias edições marcadas viram uma obra, vale o
   status mais forte (zerado > jogando > fila > não joguei), depois o mais
   recente; nota, anotações e ano do outro registro não se perdem, e o console
   onde foi zerado fica em `playedOn`.
4. **"Zerei no console…"** é opcional (`playedOn`); o painel "por console" usa
   esse campo e, sem ele, a plataforma original.
5. **Arquivos por console continuam** (carregamento sob demanda): uma obra
   multiplataforma aparece no arquivo de cada console; o app junta por ID. Os
   totais sem repetição (`_total`, `_makers`) vêm no índice.
6. **Aliases fora do bundle:** com dezenas de milhares de entradas (~650 KB
   comprimido), o mapa virou `public/catalog/aliases.json`, baixado só por quem
   tem progresso de uma versão anterior do catálogo, uma vez por versão
   (`_aliasesVersion`). Embutido, ele custava 664 KB de JS e ~600 ms de TBT a
   todo visitante — o Lighthouse do CI pegou.
7. **Notas** da IGDB: crítica especializada agregada (só com 3+ críticas) e
   público (com o número de votos). Ordem nova "Melhor nota da crítica".
8. **Ordem padrão A–Z** em todas as telas (decisão de produto).

## Consequências

- 92.990 jogos sem repetição (eram 145 mil linhas de edição).
- Filtro por console, fabricante e "Meus consoles" olha todas as plataformas do
  jogo; a busca entende o apelido de qualquer uma delas.
