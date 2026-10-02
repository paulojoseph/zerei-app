# ADR 0004 — IGDB como fonte principal e o modelo Obra/Edição

- **Status:** aceito; a unidade de marcação foi substituída pelo [ADR 0005](0005-um-card-por-jogo.md)
- **Data:** 2026-10-02

## Contexto

O catálogo da Fase 0 (libretro + Wikidata) não tem gênero, tem anos faltando,
duplicatas regionais e capas de outra plataforma, e a licença das imagens é
fraca. A auditoria de 2026-10-02 contra a IGDB:

| Console | Jogos na IGDB | Com capa | Nosso catálogo coberto (nome exato) |
| --- | --- | --- | --- |
| NES + Famicom | 2.813 | 89% | 74% |
| Master System | 564 | 95% | 80% |
| Mega Drive | 1.668 | 92% | 78% |
| SNES + Super Famicom | 3.093 | 94% | 84% |
| PS1 | 3.937 | 97% | 65% |
| PS2 | 4.297 | 99% | 71% |
| PS4 | 20.582 | 98% | 87% |
| Switch | 29.519 | 90% | 84% |

Títulos lançados no Brasil (No-Intro "(Brazil)"): 83% do Master System e 95%
do Mega Drive estão na IGDB; faltam exclusivos como "As Aventuras da TV
Colosso".

## Decisão

1. **IGDB é a fonte principal** (uso gratuito não comercial, crédito visível).
   Wikidata (CC0) entra para nomes em PT-BR e cruzamento de IDs; a curadoria
   brasileira fica em arquivos versionados no git, revisados por PR.
2. **Modelo:** *Obra* (o jogo, um `game` da IGDB sem `version_parent`) e
   *Edição* (obra × console do Zerei). **O usuário marca "zerei" na Edição**;
   o painel também agrega por Obra. O console do Zerei pode juntar várias
   plataformas da IGDB (NES = NES + Famicom; SNES = SNES + Super Famicom).
3. **Tipos aceitos** (`game_type`): jogo principal, remake, remaster, port,
   expanded game e standalone expansion. Ficam de fora DLC, bundle, mod,
   episódio, temporada, pack e update.
4. **Relançamento não é edição:** jogo cujo lançamento original é anterior ao
   console (Virtual Console, Arcade Archives, coletâneas) não entra na lista
   padrão daquele console.
5. **IDs:** a Edição herda o ID estável já publicado quando casa com um jogo do
   catálogo antigo (ADR 0002); jogo antigo sem par na IGDB continua no
   catálogo, com a fonte antiga, até ser fundido por alias. Nenhum progresso
   salvo se perde.
6. **Capas** carregadas direto do CDN da IGDB (`images.igdb.com`), sem cópia
   nossa, até os termos sobre armazenamento serem confirmados.
7. **Popularidade** (`popularity_primitives` + contagem de avaliações) ordena o
   catálogo: o clássico aparece antes do obscuro.
8. **Pipeline em TypeScript** (o gargalo é o limite de 4 req/s da IGDB, não a
   CPU), rodado pelo próprio Node 24 sem etapa de build, com respostas cruas
   em cache para reexecuções baratas.

## Consequências

- Gênero, tema, perspectiva, modos de jogo, franquia, empresas, jogos
  similares e IDs externos (Steam, Xbox, PSN — base da importação da Fase 3)
  passam a existir por jogo.
- PS4 e Switch têm 20–30 mil jogos cada na IGDB; a popularidade é o que
  impede que títulos obscuros soterrem os clássicos.
- Dependência de um terceiro (Twitch/Amazon): as respostas cruas ficam em
  cache e versionadas como artefato, para o catálogo sobreviver a uma
  mudança de termos.
