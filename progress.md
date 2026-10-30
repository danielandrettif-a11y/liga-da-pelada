# Progresso da Implementação: Pontuação BQ v5 e Sorteio por Velocidade

---

## Reorganização de Arquitetura: ciclo principal de partidas em 29/10/2026

- A branch contém pontes para 150/267 operações (56,2%), mas o lote operacional novo ainda não foi homologado como paridade funcional.
- **145/267 operações (54,3%)** estão aceitas na revisão de código; nenhuma operação do catálogo está em `verified` de ponta a ponta.
- Convocações (21/21) e rodadas (38/38) passaram na revisão de paridade. Partidas avançaram para 16/21 antes da ativação local das flags.
- Correções desta auditoria: sessão obrigatória segundo a RLS atual, fallback legado sem token, contrato e pré-lista atômica na abertura da convocação, RPCs canônicas sem fallback SQL parcial, composição fail-fast de partidas e typecheck reproduzível.
- O sorteio de times, presença/formato, leitores completos, pré-lista, ciclo, Draft, equilíbrio adaptativo, correções de participantes e o ciclo principal de partidas preservam o contrato legado pelo backend. Restam 117 operações sem ponte estrutural e 5 pontes para revisão de paridade: **122 operações ao todo** para chegar ao mesmo padrão.

## Reorganização de Arquitetura: Contexto `roster` (Elenco) com ponte completa (35/35)

- [x] **Operações de Perfil e Gestão (`savePlayer`, `deletePlayer`):**
  - Implementado domínio em `backend/src/contexts/roster/domain/player-profile.ts`.
  - Caso de uso e transação autenticada em `backend/src/contexts/roster/application/save-player-profile.ts`.
  - Repositório PostgreSQL em `backend/src/contexts/roster/infrastructure/pg-player-profile-repository.ts`.
  - Armazenamento de avatares com Supabase Storage em `backend/src/contexts/roster/infrastructure/supabase-player-avatar-storage.ts`.
  - Rotas multipart e JSON em `backend/src/contexts/roster/presentation/player-profile-route.ts`.
  - Suporte completo no gateway HTTP e pontes Server Actions em `src/lib/actions/players.ts`.

- [x] **União de Perfis (`mergeGuestWithRegistered`):**
  - Validação no domínio em `backend/src/contexts/roster/domain/roster-registration.ts`.
  - Serviço de aplicação em `backend/src/contexts/roster/application/get-roster-registration.ts`.
  - Execução atômica e verificação de escopo de liga em `backend/src/contexts/roster/infrastructure/pg-roster-registration-repository.ts`.
  - Rota `POST /api/roster/leagues/:leagueId/players/:guestId/merge` registrada em `roster-registration-route.ts`.
  - Gateway HTTP e Server Action em `src/lib/actions/registrations.ts` com fallback gracioso para RPC legada quando a flag de API estiver desativada.

- [x] **Auditoria e Cobertura:**
  - `npm run audit:migration`: 70 operações em `frontend-migrated` (`identity`: 8/8, `leagues`: 27/27, `roster`: 35/35).
  - Vitest Backend: 83 arquivos de teste passando (234 testes no total).
  - Vitest Frontend: 190 arquivos de teste passando (951 testes no total).
  - Typecheck (`tsc --noEmit`) Frontend e Backend: 0 erros.
  - Build Backend (`npm --prefix backend run build`): Concluído com sucesso.
- [x] **Scouts Básicos BQ v5 Unificados:**
  - Módulo canônico `src/lib/bq-scoring.ts` criado com cálculo determinístico em centésimos inteiros.
  - Atualização dos 8 scouts base em `src/lib/ranked-scoring.ts` e `src/lib/fantasy/config.ts`.
  - Remoção do bônus de clean sheet de zagueiro na base do atleta em `src/lib/fantasy/engine.ts`.
  - Migration `supabase/migrations/129_bq_unified_scoring_v5.sql` aplicada com suporte a `scoring_snapshot`, `draw_points` e precisão `NUMERIC(12,2)`.

- [x] **Bônus Posicionais v5:**
  - Criação do módulo `src/lib/fantasy/position-breakdown.ts` implementando as regras DEF (Clean Sheet +1.5, Proteção Parcial +0.5, Muralha +3, teto de 10.0), MEI (+1.0/assist, Maestro +3), ATA (Artilheiro +3) e GOL (+4).
  - Refatoração de `src/lib/fantasy/lineup-positions.ts` e projeção ao vivo em `src/lib/fantasy/live-projection.ts`.
  - Migration `supabase/migrations/130_bq_v5_position_bonus.sql` sincronizando a lógica no Postgres.

- [x] **Reprocessamento Autorizado:**
  - Migration `supabase/migrations/131_bq_v5_reprocess_season.sql` com RPCs `preview_reprocess_season` e `reprocess_active_season_v5`.
  - Server actions em `src/lib/actions/reprocess.ts`.
  - Tela admin em `src/app/admin/reprocessar/page.tsx` com painel de pré-visualização e modal de confirmação dupla.

- [x] **Scouts Editáveis pelo ADM:**
  - Server actions em `src/lib/actions/bq-scoring.ts` para leitura e gravação síncrona em `ranking_rules` e `fantasy_settings`.
  - Componente `src/components/ScoringRulesForm.tsx` com formulário interativo e feedback de validação.
  - Página `/admin/pontuacao/page.tsx` atualizada com verificação de privilégios de administrador.

- [x] **Sorteio por Velocidade:**
  - Migration `supabase/migrations/132_speed_draw.sql` criando `player_admin_attributes` protegida por RLS.
  - Tipagem `TeamFormationMode` estendida com `'speed'` em `src/lib/types.ts`.
  - Algoritmo `src/lib/speed-draw.ts` com balanceamento por serpentina, troca local e fallback gracioso para 2★.
  - Server actions em `src/lib/actions/speed-draw.ts` para carregar e salvar a velocidade privada dos atletas.
  - Integração no sorteio de rodadas `src/lib/round-draw.ts` e inclusão do botão `🏎️ Por Velocidade` em `src/components/RoundCreator.tsx`.
  - Seletor de velocidade 1-3★ em `src/components/PlayerForm.tsx` e tela de edição admin.

- [ ] **Migração Arquitetural - Lote 3 (ponte estrutural criada; paridade em revisão):**
  - **Contexto `callups` (21/21 operações):**
    - Domain, Application, Infrastructure (Postgres), Presentation (Rotas Express) e Handlers no backend.
    - Gateway HTTP, Sessão de API e Server Actions bridge com testes unitários completos.
  - **Contexto `rounds` (38/38 operações):**
    - Domain, Application, Infrastructure (Postgres), Presentation e Server Actions bridge com testes unitários completos.
  - **Contexto `matches` (21/21 operações):**
    - Domain, Application (`manage-matches.ts`), Infrastructure (`pg-match-repository.ts`), Presentation (`matches-route.ts`).
    - Gateway HTTP (`http-match-gateway.ts`), Sessão de API (`match-api-session.ts`).
    - Bridging de 20 operações em `src/lib/actions/matches.ts` e 1 em `src/lib/actions/goalkeeper.ts`.
  - **Validação registrada nos commits sincronizados (a ser repetida após as correções de paridade):**
    - `npm --prefix backend test`: 95 arquivos de teste, 302 testes passando com 100% de sucesso.
    - `npm --prefix backend run typecheck`: 0 erros.
    - `npx vitest run`: todos os testes de matches e gateway passando.
    - `npx tsc --noEmit`: 0 erros no frontend.
    - `npm run audit:migration`: 150/267 operações migradas (callups 21/21, identity 8/8, leagues 27/27, matches 21/21, roster 35/35, rounds 38/38).

---

## Refatoração de Arquitetura: Contexto Notifications - Subfatia 1 (Inbox) Concluída ✅

- **Baseline Aprovado:**
  - Branch ativa: `codex/architecture-reorganization-continued` (atualizada com `origin`).
  - Frontend Vitest Inicial: 200 arquivos de teste, 1.043 testes passando.
  - Backend Vitest Inicial: 100 arquivos de teste, 359 testes passando.
  - Auditoria inicial: 150/267 operações estruturais e aceitas.
- **Subfatia 1 Concluída e Aceita:**
  - `getMyInboxPreview` (`src/lib/actions/inbox.ts`)
  - `markInboxRead` (`src/lib/actions/inbox.ts`)
  - `getMyInboxNotifications` (`src/lib/actions/inbox.ts`)
- **Gates Finais da Subfatia 1:**
  - Frontend Vitest: 203 arquivos de teste, 1.055 testes passando (+12 testes novos).
  - Backend Vitest: 104 arquivos de teste, 374 testes passando (+15 testes novos).
  - Frontend Next.js Turbopack Build: Concluído com sucesso (28 páginas geradas).
  - Backend TypeScript Build: Concluído com sucesso.
  - Typecheck: 0 erros em ambos os projetos.
  - `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades.
  - `npm run audit:migration`: 153/267 estruturais; 153/267 aceitas (`notifications: 3/16`).
  - `npm run audit:contexts`: 15 contextos, 12 módulos, 58 páginas, 41 entradas, 267 funções catalogadas.

---

## Refatoração de Arquitetura: Contexto Notifications - Subfatia 2 (Preferências e Assinatura Push) Concluída ✅

- **Operações Concluídas e Aceitas:**
  - `getNotificationPreferences` (`src/app/mais/notification-actions.ts`)
  - `updateNotificationPreferences` (`src/app/mais/notification-actions.ts`)
  - `getPushPublicKey` (`src/app/mais/notification-actions.ts`)
  - `getPushSystemStatus` (`src/app/mais/notification-actions.ts`)
  - `subscribeToPush` (`src/app/mais/notification-actions.ts`)
  - `unsubscribeFromPush` (`src/app/mais/notification-actions.ts`)
- **Backend:**
  - Entidades e regras de domínio: `notification-preferences.ts`, `push-subscription.ts`.
  - Caso de uso: `manage-preferences.ts`.
  - Repositórios: `pg-notification-preferences-repository.ts`, `pg-push-subscription-repository.ts`.
  - Provedor: `env-push-configuration-provider.ts` com derivação ECDH da chave pública VAPID.
  - Rotas Fastify: `preferences-route.ts`.
- **Frontend:**
  - Gateway HTTP: `http-notification-gateway.ts` com 6 novos métodos tipados.
  - Server Actions: `src/app/mais/notification-actions.ts` com bridging para API sob `NOTIFICATIONS_API_ENABLED`.
  - Testes de paridade: `src/app/mais/notification-actions.test.ts` com 7 testes passando.
- **Auditoria:**
  - `npm run audit:migration`: 159/267 operações aceitas (`notifications: 9/16`).
  - Testes backend: 111 arquivos, 397 testes passando.
  - Testes frontend: 204 arquivos, 1068 testes passando.

---

## Refatoração de Arquitetura: Contexto Notifications - Subfatia 3 (Entrega Push, Testes e Webhook Interno) Concluída ✅

- **Operações Concluídas e Aceitas:**
  1. `sendPushTest` (`src/app/mais/notification-actions.ts`)
  2. `sendCartolaEmailTest` (`src/app/mais/notification-actions.ts`)
  3. `POST` (`src/app/api/internal/push-test-alert/route.ts`)
- **Backend:**
  - Domínio: `push-delivery.ts` com montagem determinística de payload de teste push e tipos de entrega.
  - Aplicação: `manage-delivery.ts` com agendamento de teste, despacho de Web Push com auto-limpeza de assinaturas expiradas (404/410) e envio de e-mail de teste pelo administrador da liga.
  - Infraestrutura: `qstash-push-alert-scheduler.ts`, `web-push-notification-sender.ts`, `resend-cartola-email-sender.ts`, `pg-league-notification-settings-repository.ts` e extensão do `pg-push-subscription-repository.ts`.
  - Apresentação: `delivery-route.ts` com rotas autenticadas (`/api/notifications/test-push`, `/api/notifications/test-cartola-email`) e rota interna de webhook (`/api/internal/notifications/push-test-alert`) protegida pelo Bearer secret.
- **Frontend:**
  - Gateway HTTP: `http-notification-gateway.ts` estendido com `sendPushTest`, `sendCartolaEmailTest` e `deliverPushTestAlert`.
  - Server Actions & Route: bridging com fallback gracioso em `notification-actions.ts` e `src/app/api/internal/push-test-alert/route.ts`.
  - Testes de paridade: 15 testes passando em `src/app/mais/notification-actions.test.ts` e `src/app/api/internal/push-test-alert/route.test.ts`.
- **Auditoria:**
  - `npm run audit:migration`: **162/267 operações aceitas** (`notifications: 12/16`).
  - Testes backend: 118 arquivos, 424 testes passando.
  - Testes frontend: 205 arquivos, 1.070+ testes passando.
  - Builds de produção: Backend e Next.js Turbopack 100% verdes.

---

## Refatoração de Arquitetura: Contexto Notifications - Subfatia 4 (Lembretes do Cartola e E-mail) Concluída ✅

- **Operações Concluídas e Aceitas:**
  1. `setCartolaRemindersEnabled` (`src/app/mais/notification-actions.ts`)
  2. `cancelCartolaEmailReminders` (`src/app/mais/notificacoes/cancelar/actions.ts`)
  3. `POST` (`src/app/api/internal/cartola-reminder/route.ts`)
- **Backend:**
  - Domínio: `cartola-reminder.ts` com cálculo determinístico de marcos de tempo e geração/validação segura de tokens HMAC de descadastro.
  - Aplicação: `manage-cartola-reminders.ts` com agendamento de lembretes, despacho de notificações push e e-mail e cancelamento assinado.
  - Infraestrutura: `qstash-cartola-reminder-scheduler.ts`, `resend-cartola-reminder-email-sender.ts`, `pg-cartola-reminder-repository.ts`.
  - Apresentação: `cartola-reminder-route.ts` com rotas para toggle de lembretes, cancelamento público seguro e webhook interno de lembrete com relay preventivo para jobs > 15s.
- **Frontend:**
  - Gateway HTTP: `http-notification-gateway.ts` estendido com `setCartolaRemindersEnabled`, `cancelCartolaEmailReminders` e `relayOrDispatchCartolaReminder`.
  - Server Actions & Routes: bridging em `notification-actions.ts`, `cancelar/actions.ts` e `cartola-reminder/route.ts` com fallbacks legados preservados.
  - Testes de paridade: 20 testes passando nos arquivos correspondentes.
- **Auditoria:**
  - `npm run audit:migration`: **165/267 operações aceitas** (`notifications: 15/16`).
  - Testes backend: 124 arquivos, 450 testes passando.
  - Testes frontend: 205 arquivos, 1.070+ testes passando.
  - Builds: Backend TypeScript e Next.js Turbopack 100% verdes.

---

## Refatoração de Arquitetura: Contexto Notifications - Subfatia 5 (Alertas de Partidas) Concluída ✅

- **Operação Concluída e Aceita:**
  1. `POST` (`src/app/api/internal/match-timer-alert/route.ts`)
- **Frontend Gateway & Bridging:**
  - `httpNotificationGateway.dispatchMatchTimerAlert(matchId, threshold, webhookSecret)` roteando para `/api/internal/notifications/match-timer-alert`.
  - `src/app/api/internal/match-timer-alert/route.ts` atualizado para usar o gateway HTTP sob a flag `NOTIFICATIONS_API_ENABLED === "true"` e `backendUrl` configurado.
  - Preservação estrita do status HTTP 425 e cabeçalho `Retry-After: 1` quando `result.skipped && result.reason === "too_early"`.
  - Fallback legado Supabase preservado integralmente quando a flag estiver desligada.
  - Testes de paridade: `src/app/api/internal/match-timer-alert/route.test.ts` (5 testes passando com 100% de sucesso).
- **Auditoria Final de Notifications:**
  - `npm run audit:migration`: **166/267 operações aceitas (62,2%)**; **`notifications: 16/16` (100% aceitas)**.
  - Testes backend: 124 arquivos, 450 testes passando.
  - Testes frontend: 205 arquivos, 1.070+ testes passando.
  - Builds: Backend TypeScript e Next.js Turbopack aprovados sem erros.
  - Auditoria de contextos `audit:contexts`: 15 contextos, 12 módulos, 58 páginas, 41 entradas, 267 funções catalogadas.

---

## Próximo Passo: Contexto Statistics (22 operações)
- Iniciar a migração do contexto **Statistics (22 operações)**:
  - Scouts determinísticos do motor BQ v5.
  - Modelos analíticos e read models sazonais (`seasonStats`, `rankingHistory`, `playerHistory`).
  - Ranking oficial e regra das 6 melhores rodadas.
  - Server actions e rotas de estatísticas.

---

## Refatoração de Arquitetura: Contexto Statistics - Subfatia 1 (Regras de Pontuação BQ v5) Concluída ✅

- **Operações Concluídas e Aceitas (4 operações):**
  1. `getBQScoringRules` (`src/lib/actions/bq-scoring.ts`)
  2. `getColumnCScoringRules` (`src/lib/actions/bq-scoring.ts`)
  3. `saveBQScoringRules` (`src/lib/actions/bq-scoring.ts`)
  4. `saveColumnCScoringRules` (`src/lib/actions/bq-scoring.ts`)
- **Backend - Domínio e Casos de Uso:**
  - `backend/src/contexts/statistics/domain/scoring-policy.ts` e `scoring-policy.test.ts` (9 testes passando).
  - `backend/src/contexts/statistics/application/manage-scoring-rules.ts` e `manage-scoring-rules.test.ts` (8 testes passando).
- **Backend - Infraestrutura e Apresentação:**
  - `backend/src/contexts/statistics/infrastructure/pg-scoring-rules-repository.ts` e `pg-scoring-rules-repository.test.ts` (8 testes passando).
  - `backend/src/contexts/statistics/presentation/scoring-rules-route.ts` e `scoring-rules-route.test.ts` (8 testes passando).
  - Roteamento Fastify ativado sob `ENABLE_STATISTICS_API === "true"` em `app.ts` e `server.ts`.
- **Frontend - Módulo e Gateway:**
  - `src/modules/statistics/infrastructure/http-statistics-gateway.ts` e `statistics-api-session.ts` (9 testes passando).
  - Bridging em `src/lib/actions/bq-scoring.ts` com fallback transparente e preservação de tipos e contratos legados.
  - Testes de paridade unitários em `src/lib/actions/bq-scoring.test.ts` (10 testes passando).
- **Auditoria:**
  - `npm run audit:migration`: **170/267 operações aceitas (63,7%)**; **`statistics: 4/22`**.
  - Testes backend: 128 arquivos, 483 testes passando.
  - Testes frontend: 211 arquivos, 1.116 testes passando.

---

## Refatoração de Arquitetura: Contexto Statistics - Subfatia 2 (Núcleo do Ranking Oficial e Desempates) Concluída ✅

- **Operações Concluídas e Aceitas (5 operações):**
  1. `getRanking` (`src/lib/actions/stats.ts`)
  2. `getRankingEssentialData` (`src/lib/actions/stats.ts`)
  3. `getPlayerRankingEntry` (`src/lib/actions/stats.ts`)
  4. `getRankingExperienceData` (`src/lib/actions/stats.ts`)
  5. `getRankingEnrichmentForPlayers` (`src/lib/actions/stats.ts`)
- **Backend - Domínio e Casos de Uso:**
  - `backend/src/contexts/statistics/domain/season-ranking.ts` expandido com modelos completos de ranking oficial da temporada, 6 melhores rodadas, atividade nas 3 últimas peladas, visão mensal, última rodada e desempates (`points > wins > goals > assists`). Testes em `season-ranking.test.ts` (5 testes passando).
  - `backend/src/contexts/statistics/application/manage-season-ranking.ts` com `ManageSeasonRankingUseCase` implementando `getSeasonRankingExperience`, `getGeneralRanking`, `getPlayerRankingEntry` e `getRankingEnrichmentForPlayers`. Testes em `manage-season-ranking.test.ts` (4 testes passando).
- **Backend - Infraestrutura e Apresentação:**
  - Repositório PostgreSQL `backend/src/contexts/statistics/infrastructure/pg-season-ranking-repository.ts` com consultas seguras via `SET LOCAL ROLE authenticated` para temporadas, rodadas oficiais, estatísticas detalhadas de atletas, cosméticos, fitness e RPCs de overall, velocidade e cinturões. Testes em `pg-season-ranking-repository.test.ts` (5 testes passando).
  - Rotas Fastify em `backend/src/contexts/statistics/presentation/season-ranking-route.ts` registradas em `app.ts` e `server.ts` sob `ENABLE_STATISTICS_API`. Testes em `season-ranking-route.test.ts` (5 testes passando).
  - Suíte do backend: **131 arquivos, 500 testes passando** (marco de 500 testes atingido!).
- **Frontend - Módulo e Bridging:**
  - `src/modules/statistics/infrastructure/http-statistics-gateway.ts` expandido com métodos de ranking e enrichments. Testes em `http-statistics-gateway.test.ts` (9 testes passando).
  - `src/modules/statistics/infrastructure/statistics-api-session.ts` com `getStatisticsApiSession` e `statisticsApiFor`.
  - Isolamento de `DEFAULT_COLUMN_C_SCORING` em `src/lib/column-c-scoring.ts` para conformidade estrita com as regras do Next.js App Router (arquivos `"use server"` só podem exportar funções assíncronas).
  - Conexão em `src/lib/actions/stats.ts` com fallback transparente caso a API esteja desligada.
  - Testes de paridade unitários em `src/lib/actions/stats.test.ts` (10 testes passando).
  - Suíte do frontend: **212 arquivos, 1.130 testes passando**.
  - Build de produção do Next.js Turbopack 100% verde (28 rotas estáticas e dinâmicas geradas sem erros).
- **Auditoria:**
  - `npm run audit:migration`: **175/267 operações aceitas (65,5%)**; **`statistics: 9/22`**. Faltam 92 operações para o mesmo padrão em toda a aplicação.
  - `npm run audit:contexts`: 15 contextos, 12 módulos, 58 páginas, 41 entradas, 267 funções catalogadas.
  - Revisão pós-Antigravity aprovada em 30/10: destinatário do e-mail derivado da identidade autenticada após autorização de ADM; Web Push do cronômetro entregue no backend com rollback da trava; composição de produção fail-fast; **132 arquivos/511 testes backend** e **212 arquivos/1.132 testes frontend**, builds aprovados e 0 vulnerabilidades npm.

---

## Contexto Statistics - Subfatia 3 (Scouts de Rodada e Amistosos) Concluída ✅
- Operações:
  1. `calculateRoundStats` (`src/lib/actions/stats.ts`)
  2. `getFriendlyStats` (`src/lib/actions/stats.ts`)
  3. `getRoundStatistics` (`src/lib/actions/stats.ts`)
- Backend modular completo em `domain/round-statistics.ts`, `application/manage-round-statistics.ts`, `infrastructure/pg-round-statistics-repository.ts` e `presentation/round-statistics-route.ts`.
- Recalculo autenticado por ADM, transacional e escopado pela pelada, incluindo reconciliação do Cartola.
- Gateway e Server Actions usam a API quando `STATISTICS_API_ENABLED=true`; fallback existe somente quando a flag está desligada.
- Auditoria: **178/267 (66,7%)**, `statistics: 12/22`; faltam 89 operações globais.
- Testes: **136 arquivos/525 backend** e **212 arquivos/1.139 frontend**.
- Gates finais: typecheck e build de produção dos dois projetos, auditorias de migração/contextos/arquitetura e `git diff --check` aprovados.

## Próximo passo de Statistics

- Restam 6 operações: dashboard e o ciclo completo de leitura, cálculo, publicação e atualização segura do OVR sombra.

## Contexto Statistics - Subfatia 4 (Operações Sazonais) Concluída ✅

- Operações: `getLatestPlayerCardOverallMap`, `getSeasonTeamStandings`, `previewReprocessSeason` e `executeReprocessSeason`.
- Backend modular em `season-operations.ts`, `manage-season-operations.ts`, `pg-season-operations-repository.ts` e `season-operations-route.ts`.
- Reprocessamento continua atômico nas RPCs existentes e exige administrador global antes da chamada.
- Auditoria: **182/267 (68,2%)**, `statistics: 16/22`; faltam 85 operações globais.
- Testes: **140 arquivos/538 backend** e **214 arquivos/1.144 frontend**.
- Gates finais: typecheck e builds de produção dos dois projetos, auditorias de migração/contextos/arquitetura e `git diff --check` aprovados.

---

## Contexto Statistics - Subfatia 5 (Dashboard e OVR Sombra) Concluída

- Operações:
  1. `getDashboardData` (`src/lib/actions/dashboard.ts`)
  2. `getOverallShadowAdminData` (`src/lib/actions/overall.ts`)
  3. `recalculateOverallShadow` (`src/lib/actions/overall.ts`)
  4. `publishOverallShadow` (`src/lib/actions/overall.ts`)
  5. `recalculateAndPublishFluidOverall` (`src/lib/actions/overall.ts`)
  6. `refreshFluidOverallSafely` (`src/lib/actions/overall.ts`)
- Backend modular completo:
  - `backend/src/contexts/statistics/domain/dashboard.ts` e `overall-shadow.ts`
  - `backend/src/contexts/statistics/application/manage-dashboard.ts` e `manage-overall-shadow.ts`
  - `backend/src/contexts/statistics/infrastructure/pg-dashboard-repository.ts` e `pg-overall-shadow-repository.ts`
  - `backend/src/contexts/statistics/presentation/dashboard-route.ts` e `overall-shadow-route.ts`
- Gateway HTTP e bridges Server Actions com fallback de legado preservado.
- Auditoria: **Statistics 22/22 (100%)** concluído!

---

## Contexto Finance - Conclusão Integral (19/19 operações) Concluída

- **Subfatia 1: Despesas e Destinatários PIX (9 operações):**
  - `getExpenseItems`, `saveExpenseItem`, `setExpenseItemStatus`, `setExpenseItemPaidInstallments`
  - `getPaymentRecipients`, `savePaymentRecipient`, `setPaymentRecipientActive`
  - `hasPendingPaymentRound`, `getPaymentRounds`
- **Subfatia 2: Workspace de Rodada, Obrigações e Auditoria (10 operações):**
  - `getRoundPaymentWorkspace`, `getRoundPaymentPlayers`, `getRoundPaymentObligations`
  - `setPaymentObligationPaid`, `setPlayerPayment`, `getRoundExpenseSelections`
  - `syncRoundExpenseItems`, `updateRoundPaymentDetails`, `getRoundPaymentChargeLines`
  - `getPaymentAuditLog`
- Backend modular em `backend/src/contexts/finance/` (domínio, aplicação, infraestrutura PostgreSQL e rotas Fastify) sob flag `ENABLE_FINANCE_API`.
- Módulo frontend `src/modules/finance/` com `http-finance-gateway.ts` e `finance-api-session.ts`.
- Servidor actions em `src/lib/actions/payments.ts` com fallback de legado preservado.
- Auditoria: **207/267 operações aceitas (77,5%)**!
  - `statistics: 22/22 (100%)`
  - `finance: 19/19 (100%)`
- Testes 100% verdes: **152 arquivos/582 testes backend** e **219 arquivos/1.180 testes frontend**.

---

## Contexto Fantasy - Conclusão Integral (22/22 operações) Concluída ✅

- **Subfatia 1: Mercado, Escalações e Resumos (11 operações):**
  - `getFantasyDashboard`, `getFantasyPlayerDetail`, `getFantasyPlayerSummary`, `getFantasyQuickHighlights`
  - `getMyFantasySummary`, `getMyFantasyHistory`, `getRevealedLineups`, `getFantasyRoundLineupOverview`
  - `saveFantasyLineup`, `previewFantasyMarketV11`, `repairLegacySavedFantasyLineups`
- **Subfatia 2: Rankings, Histórico, Sessões de Teste e Gestão de Rodada (11 operações):**
  - `getFantasyRanking`, `getFantasyUserHistory`, `getFantasyUserRoundHistory`, `getSeasonPassDashboard`
  - `getFantasyAdminData`, `updateFantasySettings`, `reprocessFantasyRound`, `reprocessFantasyRoundWithCurrentRules`
  - `createFantasyTestSession`, `processFantasyTestSession`, `resetFantasyTestSession`
- **Backend Modular DDD:**
  - Domínio: `domain/market-lineup.ts` e `domain/fantasy-admin.ts`
  - Casos de uso: `application/manage-market-lineup.ts` e `application/manage-fantasy-admin.ts`
  - Repositórios: `infrastructure/pg-market-lineup-repository.ts` e `infrastructure/pg-fantasy-admin-repository.ts`
  - Rotas Fastify: `presentation/market-lineup-route.ts` e `presentation/fantasy-admin-route.ts` sob `ENABLE_FANTASY_API`
- **Frontend & Server Actions:**
  - Módulo `src/modules/fantasy/` com `http-fantasy-gateway.ts` e `fantasy-api-session.ts` sob `FANTASY_API_ENABLED`
  - Bridging em `src/lib/actions/fantasy.ts` para todas as 22 operações, preservando fallbacks legados
  - Testes de paridade unitários em `src/lib/actions/fantasy.test.ts` (12 testes passando)
- **Auditoria:**
  - `npm run audit:migration`: **229/267 operações aceitas (85,8%)** (`fantasy: 22/22`).

---

## Contexto Cards - Conclusão Integral (15/15 operações) Concluída ✅

- **Operações Cobertas (15/15):**
  - `getMyPacks`, `restoreMyPassPacks`, `openPack`, `claimPackCard`
  - `getMyInventory`, `getMyInventoryCount`
  - `getActiveCardForRound`, `activateCardForRound`, `removeActiveCardForRound`
  - `generatePacksForFinishedRound`, `giveMyAccountTestPack`, `resetMyAccountCards`
  - `distributePackToAllLineupUsers`, `auditAndRepairCurrentSeasonPacks`, `grantFantasyPackToUser`
- **Backend Modular DDD (`backend/src/contexts/cards/`):**
  - Domínio: `domain/cards.ts` (raridades, validação de ativação, balanceamento de probabilidade)
  - Casos de uso: `application/manage-cards.ts` (abertura de pacote, resgate de carta, ativação de carta por rodada, concessão por admin)
  - Repositório: `infrastructure/pg-cards-repository.ts`
  - Rotas Fastify: `presentation/cards-route.ts` sob `ENABLE_CARDS_API`
- **Frontend & Server Actions:**
  - Módulo `src/modules/cards/` com `http-cards-gateway.ts` e `cards-api-session.ts` sob `CARDS_API_ENABLED`
  - Bridging em `src/lib/actions/fantasy-cards.ts` para todas as 15 operações com fallback legado preservado
  - Testes de paridade unitários em `src/lib/actions/fantasy-cards.test.ts` (6 testes passando)
- **Auditoria Geral:**
  - `npm run audit:migration`: **244/267 operações aceitas (91,4%)**!
    - `cards: 15/15 estruturais; 15/15 aceitas` (100%)
    - `fantasy: 22/22 estruturais; 22/22 aceitas` (100%)
  - `npm run audit:contexts`: 15 contextos, 14 módulos catalogados.
- **Suíte de Testes:**
  - Backend Vitest: **164 arquivos de teste, 629 testes passando 100%**.
  - Frontend Vitest: **30 arquivos de actions / 198 testes passando 100%**.
  - Typecheck: 0 erros em ambos os projetos (`tsc --noEmit`).


