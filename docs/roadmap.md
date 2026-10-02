# Roadmap

Ordem definida pela prioridade do produto: **encontrar e marcar rápido** os
jogos zerados vem antes de tudo; o painel de gráficos vem logo depois.

## Fase 0 — Fundação ✅ (PR #1)

Hospedagem em Workers + OpenNext, clique em "Zerei!" de 164 ms para 0,04 ms,
IDs estáveis, testes, cabeçalhos de segurança, CI com orçamento de performance.

## Fase 1 — Dados ✅ (PR #2)

145 mil jogos da IGDB no modelo de Edição, popularidade, relançamentos fora,
carregamento sob demanda.

## Fase 2 — MVP (em andamento)

| Marco | Entrega | Por quê |
| --- | --- | --- |
| **M1 — Marcar rápido** | Onboarding "quais consoles você teve?", filtro "Meus consoles", atalhos de teclado (setas + Z/J/Q/N), seleção múltipla com barra de ações | Registrar 200 jogos na primeira visita é o momento de ativação |
| **M2 — Painel** | Gráficos de zerados por gênero, console, geração e década; linha do tempo da vida gamer | Pedido central do produto; os gêneros já existem desde a Fase 1 |
| **M3 — Compartilhar** | Card "Gamer DNA" (imagem para stories e prévia de link), rótulos com humor brasileiro, botões de compartilhamento | Motor de viralização |
| **M4 — Página do jogo** | URL própria por jogo e por console, renderizada na borda; jogos similares; compartilhar "zerei este jogo" | SEO e links compartilháveis |
| **M5 — Escala** | Índice de busca em Web Worker, grade virtualizada, página pública `/status` com métricas reais (RUM) | LCP ≤ 1,8 s e INP ≤ 100 ms no Android intermediário |

## Fase 3 — Crescimento

Contas e sincronização (login Google, sem senha), perfis públicos, comparar
com um amigo, importação da Steam e do RetroAchievements (como sugestões que o
usuário confirma), comunidade em degraus (primeiro sem texto livre, depois
clubes com moderação), recomendador "quem zerou X também zerou Y", recordes de
speedrun (speedrun.com) e a IA para achar o jogo perdido da infância.
