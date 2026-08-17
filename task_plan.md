# Plano de Execução: Performance V1 — Parte 1/3 (Auditoria + Navegação + Loading + Cache + Velocidade Percebida)

## Objetivo
Identificar e eliminar gargalos de lentidão na navegação do app `liga-da-pelada`, garantindo feedback visual imediato (<100ms) ao toque, skeletons fluidos sem layout shift, carregamento em streaming via Suspense/loading.tsx e cache inteligente com invalidação precisa.

---

## Fases de Execução

- [x] **Fase 1: Auditoria Completa & Medições Iniciais (Benchmark)**
  - [x] Mapear ocorrências de `revalidate = 0`, `force-dynamic`, Server Components e Client Components.
  - [x] Identificar queries Supabase pesadas, chamadas sequenciais e rotas sem loading state.
  - [x] Instrumentar e medir tempos de execução reais das funções centrais (`getRounds`, `getRanking`, `getPlayersWithStats`, `getPlayer`, `getRound`, `getRoundStatistics`).
  - [x] Gerar tabela de auditoria categorizada por gravidade (CRÍTICO, ALTO, MÉDIO, BAIXO).

- [x] **Fase 2: Feedback Imediato de Navegação & BottomNav (<100ms)**
  - [x] Otimizar `src/components/BottomNav.tsx` para feedback tátil/visual imediato ao toque em todas as abas.
  - [x] Otimizar `SessionBottomNav.tsx` com tratamento resiliente e cache request-level para não bloquear a renderização da casca do layout.
  - [x] Configurar prefetching inteligente nas rotas principais (`/`, `/rodadas`, `/ranking`, `/jogadores`, `/mais`, `/cartola`).

- [x] **Fase 3: Criação de `loading.tsx` e Skeletons Específicos por Rota**
  - [x] `src/app/rodadas/loading.tsx`: Skeleton estrutural da listagem de rodadas com badges e cards dimensionados.
  - [x] `src/app/rodadas/[id]/loading.tsx`: Skeleton do detalhe da rodada (cabeçalho, 3 campinhos de times, confrontos).
  - [x] `src/app/ranking/loading.tsx`: Skeleton das abas, pódio top 3 e tabela de classificação.
  - [x] `src/app/jogadores/loading.tsx`: Skeleton do diretório de elenco, abas e grid de cards de atletas.
  - [x] `src/app/jogadores/[id]/loading.tsx`: Skeleton do perfil completo (avatar, bio, grid 8 stats, gols por clube).
  - [x] `src/app/partidas/[id]/loading.tsx`: Skeleton da súmula ao vivo, placar e escalações.
  - [x] `src/app/mais/loading.tsx`: Skeleton do perfil conectado e lista de módulos administrativos.
  - [x] `src/app/convocacao/loading.tsx`: Skeleton da convocação aberta com estádio e lista de presenças.
  - [x] `src/app/pagamentos/loading.tsx`: Skeleton do Transfermarket e checklist financeiro.
  - [x] `src/app/cartola/loading.tsx`: Skeleton do Fantasy e mercado.

- [x] **Fase 4: Otimização de Queries & Eliminação de Over-fetching**
  - [x] Otimizar `src/app/jogadores/[id]/page.tsx` para buscar apenas os dados do jogador específico (eliminando o carregamento de todos os jogadores da liga em `getPlayersWithStats`).
  - [x] Otimizar chamadas em `src/lib/actions/rounds.ts` e `src/lib/actions/players.ts` eliminando chamadas sequenciais redundantes de `getActiveLeague`.
  - [x] Refatorar consultas paralelas em Server Components críticos.

- [x] **Fase 5: Classificação de Cache & Invalidação Precisa**
  - [x] Classificar rotas entre REALTIME (partida ao vivo, convocação ativa), MUDA POUCO (elenco, perfil, configs) e MUDA APÓS EVENTO (ranking, rodadas finalizadas).
  - [x] Ajustar `revalidatePath` e revalidação de tags para garantir dados sempre frescos sem forçar re-render total síncrono desnecessário em cada clique.

- [x] **Fase 6: Medição Final, Validação e Relatório Parte 1**
  - [x] Rodar bateria de testes unitários (`npm test` - 36 testes passando).
  - [x] Validar compilação de produção (`npm run build`).
  - [x] Executar benchmark comparativo Antes x Depois no build de produção (`npm run start`).
  - [x] Produzir relatório final detalhado com tabela Antes x Depois e parar para revisão do usuário antes da Parte 2.

- [x] **Fase 7: Performance V1 — Parte 2/3 (Supabase + SQL + Views + Índices + Queries)**
  - [x] Migration `046_performance_views_and_indexes.sql` com VIEW SQL `player_season_stats`.
  - [x] Criação de 5 índices compostos nas tabelas relacionais mais acessadas.
  - [x] Refatoração de `getRanking` e `getFriendlyStats` para consultar a View diretamente.
  - [x] Otimização de `getPlayersWithStats` e `getPlayer` eliminando over-fetching.
  - [x] Eliminação de `select("*")` em consultas críticas (`getRound`, `getMatch`, `getRounds`).
  - [x] Testes de regressão e simulação de volume de 1.500+ stats em Vitest.

- [x] **Fase 8: Performance V1 — Parte 3/3 (Jogo Ao Vivo + Optimistic UI + Timer + Mobile + Benchmark Final)**
  - [x] Migration `047_register_goal_rpc.sql` com RPCs `register_goal` e `delete_match_event` (SELECT FOR UPDATE + idempotência).
  - [x] Chave de idempotência (`idempotency_key`) com índice único parcial em `match_events`.
  - [x] Server actions `registerGoal` e `deleteEvent` refatoradas para 1 único round-trip atômico.
  - [x] `MatchLiveBoard.tsx` refatorado com Optimistic UI (<10ms) e rollback seguro.
  - [x] `MatchTimer` isolado com `memo` para eliminar re-renders globais da tela a cada segundo.
  - [x] Proteção contra duplo clique / double-tap com `useRef`.
  - [x] Suporte abrangente a `prefers-reduced-motion` no `globals.css`.
  - [x] Suíte de testes expandida para 41 testes (100% passando).
  - [x] Compilação Next.js 16 validada com sucesso em todas as 34 rotas.
  - [x] Relatório Consolidado de Benchmark Final (Partes 1, 2 e 3).
