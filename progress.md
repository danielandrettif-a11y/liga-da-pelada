# Progresso do Projeto

## Funcionalidades Implementadas e Validadas

### Lote 1 (Gestão de Estádios & Convocação):
1. **Migration Supabase & Schemas**: `044_stadiums_management_and_callup_details.sql` criada com tabela `stadiums`, campos de localização nas convocações e rodadas, triggers e RLS.
2. **Módulo de Gestão de Estádios**: `src/lib/actions/stadiums.ts`, `src/components/StadiumsManager.tsx`, `/mais/estadios` e link no menu `/mais`.
3. **Abertura de Convocação & Convite WhatsApp Enriquecido**: `src/lib/actions/callups.ts`, `src/components/CallupAdminCard.tsx`, `src/components/CallupBoard.tsx`.
4. **Criação de Rodadas com Estádio**: `src/lib/actions/rounds.ts`, `src/components/RoundCreator.tsx`, `/admin/rodada`.
5. **Banner da Home Dinâmico**: `src/components/OpenCallupBanner.tsx`, `src/lib/actions/dashboard.ts`, `src/app/page.tsx`.
6. **Cartola - Ranking da Rodada com Confirmados vs Pendentes**: `src/lib/actions/fantasy.ts`, `src/components/fantasy/FantasyRankingList.tsx`, `src/app/cartola/ranking/page.tsx`.

### Lote 2 (Experiência do Usuário, Coletes, Tutorial e Gerador de Arte):
7. **Transições Rápidas**: Animações reduzidas para 150-200ms em `src/app/globals.css`.
8. **Zoom na Foto dos Atletas**: Modal lightbox em `src/components/PlayerAvatar.tsx`.
9. **Convocação Oculta ao Iniciar Rodada**: `src/lib/actions/callups.ts` e `src/lib/actions/dashboard.ts`.
10. **Tag e Cor do Colete no Sorteio de Times**: Paleta de cores de colete e tags de coletes em `src/components/RoundCreator.tsx`.
11. **Popup Pós-Confirmação na Convocação**: Modal de celebração e chamada para o Cartola com resumo de pontuação e valorização em `src/components/CallupBoard.tsx` e `src/lib/actions/fantasy.ts`.
12. **Botões de Ajuda nos Palpites do Cartola**: Ícone `?` e modal explicativo em `src/components/fantasy/FantasyExperience.tsx`.
13. **Tutorial Onboarding do Cartola**: `src/components/fantasy/FantasyTutorialModal.tsx` acionado na 1ª visita ou pelo botão "Tutorial" no topo de `/cartola`.
14. **Gerador de Arte Instagram Story (1080x1920)**: `src/components/RoundInstagramStoryGenerator.tsx` na página `/rodadas/[id]` com suporte a foto de fundo, tabela dos 3 times, artilheiro e garçom de cada time e botões de download/compartilhamento.

### Lote 4 (Performance V1 — Parte 1/3: Auditoria, Navegação, Loading e Skeletons):
### Lote 5 (Performance V1 — Parte 2/3: Supabase + SQL + Views + Índices + Queries):
24. **VIEW SQL `player_season_stats`**: Migration `046_performance_views_and_indexes.sql` criada com cálculo determinístico de `rounds_count, games, wins, draws, losses, goals, assists, points, win_rate` via `SUM + GROUP BY + CASE`, transferindo agregação do Node.js para o PostgreSQL.
25. **Índices Compostos de Performance**: Criados 5 novos índices compostos (`idx_player_round_stats_round_player`, `idx_match_events_player_type`, `idx_team_players_player`, `idx_round_players_player`, `idx_matches_round_status`).
26. **Refatoração de Queries de Ranking e Amistosos**: `getRanking()` e `getFriendlyStats()` refatorados em `src/lib/actions/stats.ts` para consumir a view em uma única consulta direta ordenada com fallback seguro.
27. **Otimização de `getPlayersWithStats` e `getPlayer`**: Em `src/lib/actions/players.ts`, reduzido de 4-5 queries para 2 queries paralelas com consulta pré-agregada na view.
28. **Eliminação de `select("*")`**: Consultas em `getRound`, `getMatch`, `getRounds` e `getPlayer` refatoradas com campos explícitos, reduzindo drásticamente o tamanho do payload.
29. **Testes de Regressão e Volume**: Suíte com 38 testes vitest (100% passando), comprovando equivalência matemática e idempotência entre agregação legado e SQL com volume de 1.500+ stats.

### Lote 6 (Performance V1 — Parte 3/3: Jogo Ao Vivo + Optimistic UI + Timer + Mobile + Benchmark Final):
30. **RPCs Transacionais Atômicas (`register_goal` e `delete_match_event`)**: Migration `047_register_goal_rpc.sql` criada com `SELECT FOR UPDATE` para bloqueio de linha, idempotência, integridade referencial, inserção/remoção em `match_events` e atualização atômica do placar de `matches` em 1 único round-trip ao Supabase.
31. **Chave de Idempotência (`idempotency_key`)**: Adicionada a `match_events` com índice único parcial, prevenindo duplicações de gols em casos de falha de conexão ou cliques repetidos.
32. **Optimistic UI com Rollback Seguro**: `MatchLiveBoard.tsx` atualiza placar e timeline imediatamente (<10ms) ao clicar em registrar/remover gol, com reversão automática do estado em caso de falha.
33. **Isolamento de Renderização do `MatchTimer`**: Cronômetro extraído para componente memoizado (`MatchTimer`), eliminando re-renderizações globais da tela de jogo ao vivo a cada segundo.
34. **Proteção contra Duplo Clique / Double Tap**: Implementadas travas via `useRef` para impedir múltiplos envios acidentais.
35. **Suporte Abrangente a `prefers-reduced-motion`**: Adicionado em `src/app/globals.css` para acelerar ou desativar animações para usuários sensíveis a movimento.
36. **Suíte de Testes Expandida**: 41 testes em Vitest (100% passando), cobrindo regras de participação, idempotência de gol, concorrência atômica e rollback otimista.
37. **Compilação e Tipagem Limpas**: `npm run build` executado com 100% de sucesso em todas as 34 rotas do Next.js 16.
