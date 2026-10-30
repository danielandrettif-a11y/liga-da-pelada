# Plano de Refatoração Arquitetural: Contexto Notifications

## Objetivo
Implementar a refatoração modular DDD do contexto `Notifications` da aplicação Liga da Pelada a partir da branch `codex/architecture-reorganization-continued`, entregando fatias verticais pequenas, revisáveis e estritamente cobertas por testes de paridade, mantendo fallbacks legados sob feature flags.

---

## Subfatia 1: Inbox (Leitura, Prévia e Marcação como Lida) - Concluída ✅

### Operações Cobertas
1. `getMyInboxPreview` (`src/lib/actions/inbox.ts`)
2. `markInboxRead` (`src/lib/actions/inbox.ts`)
3. `getMyInboxNotifications` (`src/lib/actions/inbox.ts`)

### Checklist da Subfatia 1
- [x] **Etapa 0: Verificação de Baseline**
  - Confirmação de branch `codex/architecture-reorganization-continued` e HEAD
  - Execução limpa de auditorias (`audit:migration`, `audit:contexts`)
  - Suíte completa de testes aprovada: 1.043 testes frontend (200 arquivos) e 359 testes backend (100 arquivos)
- [x] **Etapa 1: Backend - Domínio e Casos de Uso (`backend/src/contexts/notifications/`)**
  - Modelos de domínio: `inbox-notification.ts` (entidade/valor, tipos, filtros)
  - Casos de uso: `manage-inbox.ts`
  - Interfaces de portas: `InboxRepository`
  - Testes unitários de domínio e aplicação (`inbox-notification.test.ts`, `manage-inbox.test.ts`)
- [x] **Etapa 2: Backend - Infraestrutura e Apresentação**
  - Repositório PostgreSQL: `pg-inbox-repository.ts` (consultas escopadas com `SET LOCAL ROLE authenticated`)
  - Rotas Fastify: `inbox-route.ts` (GET `/api/notifications/inbox/preview`, POST `/api/notifications/inbox/sync`, POST `/api/notifications/inbox/read`)
  - Registro em `backend/src/presentation/app.ts` e `backend/src/server.ts` sob flag `ENABLE_NOTIFICATIONS_API`
  - Testes de integração/repositório e apresentação Fastify (`pg-inbox-repository.test.ts`, `inbox-route.test.ts`)
- [x] **Etapa 3: Frontend - Módulo Notifications (`src/modules/notifications/`)**
  - Domínio e tipos compartilhados: `src/modules/notifications/domain/inbox.ts`
  - Gateway HTTP: `src/modules/notifications/infrastructure/http-notification-gateway.ts`
  - Factory de Sessão: `src/modules/notifications/infrastructure/notification-api-session.ts` (com flag `NOTIFICATIONS_API_ENABLED`)
  - Testes unitários do gateway e session factory (`http-notification-gateway.test.ts`, `notification-api-session.test.ts`)
- [x] **Etapa 4: Frontend - Integração com Server Action (`src/lib/actions/inbox.ts`)**
  - Adaptação de `getMyInboxPreview`, `markInboxRead` e `getMyInboxNotifications` para chamar o gateway quando a sessão/flag estiver ativa, preservando fallback e assinaturas públicas
  - Testes unitários e de paridade em `src/lib/actions/inbox.test.ts`
- [x] **Etapa 5: Validação, Auditoria e Registros**
  - Execução dos gates de validação (typecheck, vitest, build em ambos os projetos: 1.055 frontend / 374 backend)
  - Atualização de `architecture/operation-migration-status.json` e `architecture/operation-parity-status.json`
  - Execução de `npm run audit:migration` (153/267 aceitas) e `npm run audit:contexts` (12 módulos catalogados)
  - Atualização de `findings.md`, `progress.md` e `docs/architecture/REFACTORING.md`

---

## Subfatia 2: Preferências e Assinatura Web Push - Concluída ✅

### Operações Cobertas
1. `getNotificationPreferences` (`src/app/mais/notification-actions.ts`)
2. `updateNotificationPreferences` (`src/app/mais/notification-actions.ts`)
3. `getPushPublicKey` (`src/app/mais/notification-actions.ts`)
4. `getPushSystemStatus` (`src/app/mais/notification-actions.ts`)
5. `subscribeToPush` (`src/app/mais/notification-actions.ts`)
6. `unsubscribeFromPush` (`src/app/mais/notification-actions.ts`)

### Checklist da Subfatia 2
- [x] **Backend - Domínio e Casos de Uso (`backend/src/contexts/notifications/`)**
  - Modelos de domínio: `notification-preferences.ts`, `push-subscription.ts`
  - Casos de uso: `manage-preferences.ts`
  - Portas: `NotificationPreferencesRepository`, `PushSubscriptionRepository`, `PushConfigurationProvider`
  - Testes unitários de domínio e aplicação
- [x] **Backend - Infraestrutura e Apresentação**
  - Repositórios: `pg-notification-preferences-repository.ts`, `pg-push-subscription-repository.ts`
  - Provedor: `env-push-configuration-provider.ts` com derivação ECDH de chave pública
  - Rotas Fastify: `preferences-route.ts`
  - Composição em `app.ts` e `server.ts`
  - Testes de repositório e rotas Fastify
- [x] **Frontend - Módulo Notifications (`src/modules/notifications/`)**
  - Domínio: `src/modules/notifications/domain/preferences.ts`
  - Gateway: Métodos de preferências e push em `http-notification-gateway.ts`
  - Testes do gateway HTTP cobrindo as 6 operações
- [x] **Frontend - Server Actions (`src/app/mais/notification-actions.ts`)**
  - Bridging com preservação de assinaturas públicas e fallback
  - Testes de paridade em `src/app/mais/notification-actions.test.ts`
- [x] **Validação e Auditoria**
  - Auditoria: 159/267 operações aceitas (`notifications: 9/16`)
  - Testes 100% verdes no frontend e backend

---

## Subfatia 3: Entrega Push, Testes Administrativos e Webhook Interno - Concluída ✅

### Operações Cobertas
1. `sendPushTest` (`src/app/mais/notification-actions.ts`)
2. `sendCartolaEmailTest` (`src/app/mais/notification-actions.ts`)
3. `POST` (`src/app/api/internal/push-test-alert/route.ts`)

### Checklist da Subfatia 3
- [x] **Backend - Domínio e Casos de Uso (`backend/src/contexts/notifications/`)**
  - Modelos de domínio: `push-delivery.ts` com payload canônico de teste e tipos de entrega
  - Casos de uso: `manage-delivery.ts` (`schedulePushTest`, `deliverPushTestAlert`, `sendCartolaEmailTest`)
  - Portas: `PushAlertScheduler`, `PushNotificationSender`, `PushDeliverySubscriptionRepository`, `CartolaEmailSender`, `LeagueNotificationSettingsRepository`
  - Testes unitários de domínio e aplicação (`push-delivery.test.ts`, `manage-delivery.test.ts`)
- [x] **Backend - Infraestrutura e Apresentação**
  - Adaptadores:
    - `qstash-push-alert-scheduler.ts` (delay de 10s no QStash com webhook secret)
    - `web-push-notification-sender.ts` (envio com auto-limpeza de assinaturas 404/410)
    - `resend-cartola-email-sender.ts` (Resend com token assinado HMAC SHA-256 de cancelamento)
    - `pg-league-notification-settings-repository.ts` (verificação de ADM e gravação de `cartola_email_tested_at`)
    - `pg-push-subscription-repository.ts` estendido com busca e remoção em lote de assinaturas expiradas
  - Rotas Fastify: `delivery-route.ts` (`POST /api/notifications/test-push`, `POST /api/notifications/test-cartola-email`, `POST /api/internal/notifications/push-test-alert`)
  - Composição em `app.ts` e `server.ts`
  - Testes de infraestrutura e rotas Fastify (todos passando)
- [x] **Frontend - Módulo Notifications (`src/modules/notifications/`)**
  - Métodos no gateway `httpNotificationGateway`: `sendPushTest`, `sendCartolaEmailTest`, `deliverPushTestAlert`
  - Testes unitários cobrindo os novos métodos em `http-notification-gateway.test.ts`
- [x] **Frontend - Server Actions e Rota Interna**
  - Bridging em `sendPushTest` e `sendCartolaEmailTest` em `src/app/mais/notification-actions.ts`
  - Rota `src/app/api/internal/push-test-alert/route.ts` roteada via API quando flag ativada
  - Testes de paridade em `src/app/mais/notification-actions.test.ts` e `src/app/api/internal/push-test-alert/route.test.ts`
- [x] **Validação e Auditoria**
  - Auditoria: 162/267 operações aceitas (`notifications: 12/16`)
  - Testes backend: 118 arquivos, 424 testes passando
  - Testes frontend: 205 arquivos, 1.070+ testes passando
  - Build do backend TypeScript e build do Next.js Turbopack 100% aprovados

---

## Subfatia 4: Lembretes do Cartola e E-mail - Concluída ✅

### Operações Cobertas
1. `setCartolaRemindersEnabled` (`src/app/mais/notification-actions.ts`)
2. `cancelCartolaEmailReminders` (`src/app/mais/notificacoes/cancelar/actions.ts`)
3. `POST` (`src/app/api/internal/cartola-reminder/route.ts`)

### Checklist da Subfatia 4
- [x] **Backend - Domínio e Casos de Uso (`backend/src/contexts/notifications/`)**
  - Modelos de domínio: `cartola-reminder.ts` (cálculo ISO de horários, marcos `24h` e `2h`, token HMAC SHA-256 de cancelamento)
  - Casos de uso: `manage-cartola-reminders.ts` (`toggleReminders`, `cancelEmailReminders`, `dispatchCartolaReminder`)
  - Portas: `CartolaReminderRepository`, `CartolaReminderScheduler`, `CartolaReminderEmailSender`
  - Testes unitários de domínio e aplicação (`cartola-reminder.test.ts`, `manage-cartola-reminders.test.ts`)
- [x] **Backend - Infraestrutura e Apresentação**
  - Adaptadores:
    - `qstash-cartola-reminder-scheduler.ts` (agendamento no QStash com delay e cabeçalhos Upstash)
    - `resend-cartola-reminder-email-sender.ts` (envio idempotente pelo Resend com link seguro de cancelamento)
    - `pg-cartola-reminder-repository.ts` (verificação de ADM, RLS, busca de escalações incompletas e claim atômico anti-duplicação)
  - Rotas Fastify: `cartola-reminder-route.ts` (`POST /api/notifications/cartola/reminders/toggle`, `POST /api/notifications/cartola/reminders/cancel`, `POST /api/internal/notifications/cartola-reminder`)
  - Composição em `app.ts` e `server.ts` sob `ENABLE_NOTIFICATIONS_API`
  - Testes unitários e de rotas Fastify (todos passando)
- [x] **Frontend - Módulo Notifications (`src/modules/notifications/`)**
  - Métodos no gateway `httpNotificationGateway`: `setCartolaRemindersEnabled`, `cancelCartolaEmailReminders`, `relayOrDispatchCartolaReminder`
  - Testes unitários no gateway cobrindo os novos métodos em `http-notification-gateway.test.ts`
- [x] **Frontend - Server Actions e Rota Interna**
  - Bridging em `setCartolaRemindersEnabled` em `src/app/mais/notification-actions.ts`
  - Bridging em `cancelCartolaEmailReminders` em `src/app/mais/notificacoes/cancelar/actions.ts`
  - Rota `src/app/api/internal/cartola-reminder/route.ts` roteada via API quando flag ativa com fallback legado preservado
  - Testes de paridade unitários nos 3 arquivos
- [x] **Validação e Auditoria**
  - Auditoria: 165/267 operações aceitas (`notifications: 15/16`)
  - Testes backend: 124 arquivos, 450 testes passando
  - Testes frontend: 205 arquivos, 1.070+ testes passando
  - Build do backend TypeScript e build do Next.js Turbopack 100% aprovados

---

## Subfatia 5: Alertas de Partidas e Cronômetro - Concluída ✅

### Operações Cobertas
1. `POST` (`src/app/api/internal/match-timer-alert/route.ts`)

### Checklist da Subfatia 5
- [x] **Frontend - Gateway HTTP (`src/modules/notifications/infrastructure/http-notification-gateway.ts`)**
  - Método `dispatchMatchTimerAlert(matchId, threshold, webhookSecret)` chamando `POST /api/internal/notifications/match-timer-alert`
  - Teste unitário correspondente em `http-notification-gateway.test.ts`
- [x] **Frontend - Rota Interna e Bridge (`src/app/api/internal/match-timer-alert/route.ts`)**
  - Roteamento sob flag `NOTIFICATIONS_API_ENABLED === "true"` e backendUrl configurado
  - Preservação estrita de contrato de erro 425 com cabeçalho `Retry-After: 1` quando `reason === "too_early"`
  - Fallback legado inalterado e seguro quando flag estiver desligada
  - Teste unitário e de regressão em `src/app/api/internal/match-timer-alert/route.test.ts`
- [x] **Validação e Auditoria**
  - Auditoria: **166/267 operações aceitas (62,2%)**; **`notifications: 16/16` (100% aceitas)**
  - Backend: 124 arquivos, 450 testes passando, `tsc` com 0 erros
  - Frontend: 205 arquivos, 1.070+ testes passando, `tsc` com 0 erros
  - Build Next.js Turbopack 100% verde (28 rotas e páginas estáticas geradas com sucesso)
  - Auditoria de contextos `audit:contexts` aprovada (15 contextos, 12 módulos, 58 páginas, 41 entradas catalogadas)

---

---

## Contexto Statistics: Subfatia 1 - Regras e Política de Pontuação BQ v5 - Concluída ✅

### Operações Cobertas (4 operações)
1. `getBQScoringRules` (`src/lib/actions/bq-scoring.ts`)
2. `getColumnCScoringRules` (`src/lib/actions/bq-scoring.ts`)
3. `saveBQScoringRules` (`src/lib/actions/bq-scoring.ts`)
4. `saveColumnCScoringRules` (`src/lib/actions/bq-scoring.ts`)

### Checklist da Subfatia 1
- [x] **Backend - Domínio e Casos de Uso (`backend/src/contexts/statistics/`)**
  - Modelos de domínio: `scoring-policy.ts` (regras BQ v5 e Coluna C com centésimos inteiros)
  - Casos de uso: `manage-scoring-rules.ts` (`getRules`, `saveRules`, `getColumnCRules`, `saveColumnCRules`)
  - Portas: `ScoringRulesRepository`
  - Testes unitários de domínio e aplicação (`scoring-policy.test.ts`, `manage-scoring-rules.test.ts`)
- [x] **Backend - Infraestrutura e Apresentação**
  - Repositório PostgreSQL: `pg-scoring-rules-repository.ts`
  - Rotas Fastify: `scoring-rules-route.ts` (`GET/PUT /api/statistics/leagues/:leagueId/rules/bq`, `GET/PUT /api/statistics/leagues/:leagueId/rules/column-c`)
  - Registro em `app.ts` e `server.ts` sob flag `ENABLE_STATISTICS_API`
  - Testes de infraestrutura e rotas Fastify (`pg-scoring-rules-repository.test.ts`, `scoring-rules-route.test.ts`)
- [x] **Frontend - Módulo Statistics (`src/modules/statistics/`)**
  - Gateway HTTP: `http-statistics-gateway.ts`
  - Factory de Sessão: `statistics-api-session.ts`
  - Testes do gateway e session factory
- [x] **Frontend - Integração com Server Actions (`src/lib/actions/bq-scoring.ts`)**
  - Preservação estrita das assinaturas públicas e contratos de retorno
  - Fallback legado Supabase preservado integralmente
  - Testes de paridade unitários em `src/lib/actions/bq-scoring.test.ts`
- [x] **Validação e Auditoria**
  - Auditoria: 170/267 operações aceitas (63,7%) (`statistics: 4/22`)
  - Testes backend: 128 arquivos, 483 testes passando
  - Testes frontend: 211 arquivos, 1.116 testes passando

---

## Contexto Statistics: Subfatia 2 - Núcleo do Ranking Oficial e Desempates - Concluída ✅

### Operações Cobertas (5 operações)
1. `getRanking` (`src/lib/actions/stats.ts`)
2. `getRankingEssentialData` (`src/lib/actions/stats.ts`)
3. `getPlayerRankingEntry` (`src/lib/actions/stats.ts`)
4. `getRankingExperienceData` (`src/lib/actions/stats.ts`)
5. `getRankingEnrichmentForPlayers` (`src/lib/actions/stats.ts`)

### Checklist da Subfatia 2
- [x] **Etapa 1: Backend - Domínio e Tipos de Ranking (`backend/src/contexts/statistics/domain/`)**
  - Modelos e agregados: expandido `season-ranking.ts` com agregação completa das rodadas oficiais, cálculo das 6 melhores atuações (`countedInTop6`), desempates canônicos (`points > wins > goals > assists`), filtros de atividade (3 rodadas mais recentes) e elegibilidade competitiva.
  - Modelos para visão geral (`general`), visão mensal (`monthly`) e última rodada (`latestRound`).
  - Modelos de enriquecimento por atleta (`RankingEnrichment`).
  - Testes unitários de domínio puro em `season-ranking.test.ts` (5 testes passando).
- [x] **Etapa 2: Backend - Casos de Uso (`backend/src/contexts/statistics/application/`)**
  - Criado `manage-season-ranking.ts`:
    - `getSeasonRankingExperience(actor, leagueId, options: { includeEnrichment: boolean })`
    - `getGeneralRanking(actor, leagueId)`
    - `getPlayerRankingEntry(actor, leagueId, playerId: string)`
    - `getRankingEnrichmentForPlayers(actor, leagueId, playerIds: string[])`
  - Interface de porta `SeasonRankingRepository`.
  - Testes unitários do caso de uso em `manage-season-ranking.test.ts` (4 testes passando).
- [x] **Etapa 3: Backend - Infraestrutura PostgreSQL (`backend/src/contexts/statistics/infrastructure/`)**
  - Criado `pg-season-ranking-repository.ts` com consultas otimizadas:
    - Temporada ativa da liga (`seasons`)
    - Rodadas oficiais finalizadas (`rounds`)
    - Estatísticas dos atletas (`player_round_stats` com dados de `players`)
    - Atributos e enriquecimentos opcionais (`player_round_fitness`, RPCs `get_latest_player_card_overalls_for_league`, `get_public_player_speed_ratings_for_league`, `get_league_achievement_belt_holders`, cosméticos equipados).
  - Testes de repositório em `pg-season-ranking-repository.test.ts` (5 testes passando).
- [x] **Etapa 4: Backend - Apresentação Fastify (`backend/src/contexts/statistics/presentation/`)**
  - Criado `season-ranking-route.ts`:
    - `GET /api/statistics/leagues/:leagueId/ranking` (retorna `general` da experiência de ranking)
    - `GET /api/statistics/leagues/:leagueId/ranking/experience` (query param `includeEnrichment=true|false`)
    - `GET /api/statistics/leagues/:leagueId/ranking/players/:playerId`
    - `POST /api/statistics/leagues/:leagueId/ranking/enrichment` (body `{ playerIds: string[] }`)
  - Registrado em `app.ts` e `server.ts` sob `ENABLE_STATISTICS_API`.
  - Testes de rota Fastify em `season-ranking-route.test.ts` (5 testes passando).
- [x] **Etapa 5: Frontend - Módulo Statistics (`src/modules/statistics/`)**
  - Expandido `http-statistics-gateway.ts` com:
    - `getRanking(leagueId)`
    - `getRankingExperience(leagueId, options?: { includeEnrichment?: boolean })`
    - `getPlayerRankingEntry(leagueId, playerId)`
    - `getRankingEnrichmentForPlayers(leagueId, playerIds)`
  - Testes unitários no gateway cobrindo as 5 operações em `http-statistics-gateway.test.ts` (9 testes passando).
- [x] **Etapa 6: Frontend - Bridging nas Server Actions (`src/lib/actions/stats.ts`)**
  - Conectado `getRanking`, `getRankingEssentialData`, `getRankingExperienceData`, `getPlayerRankingEntry`, `getRankingEnrichmentForPlayers`.
  - Preservado rigorosamente fallback legado para quando `STATISTICS_API_ENABLED` estiver desligada; falhas da API habilitada não executam fallback silencioso.
  - Testes de paridade unitários em `src/lib/actions/stats.test.ts` (10 testes passando).
- [x] **Etapa 7: Validação, Auditoria e Registros**
  - Backend: **131 arquivos, 500 testes passando**, `tsc` com 0 erros.
  - Frontend: **212 arquivos, 1.130 testes passando**, `tsc` com 0 erros.
  - Build Next.js Turbopack 100% verde (28 rotas estáticas e dinâmicas geradas com sucesso).
  - Atualizados `architecture/operation-migration-status.json` e `architecture/operation-parity-status.json` (**175 de 267 operações aceitas (65,5%)**; `statistics: 9/22`).

---

## Contexto Statistics: Subfatia 3 - Scouts de Rodada e Amistosos - Concluída ✅

### Operações Cobertas (3 operações)
1. `calculateRoundStats` (`src/lib/actions/stats.ts`)
2. `getFriendlyStats` (`src/lib/actions/stats.ts`)
3. `getRoundStatistics` (`src/lib/actions/stats.ts`)

### Planejamento da Subfatia 3
- [x] **Backend - Domínio e Casos de Uso:**
  - Consolidar apuração de partidas encerradas, scouts defensivos/ofensivos e de goleiros em rodadas oficiais e amistosas.
  - `calculateRoundStats`: cálculo determinístico, gravação atômica em `player_round_stats` e reconciliação dos totais do Cartola (`reconcile_fantasy_round_totals`).
  - `getRoundStatistics` e `getFriendlyStats`: leituras de atuações e líderes/destaques da rodada.
- [x] **Backend - Infraestrutura e Apresentação:**
  - Repositório PostgreSQL para rodadas, partidas, escalações e eventos.
  - Rotas Fastify em `round-statistics-route.ts`.
- [x] **Frontend - Gateway e Bridging:**
  - Métodos em `http-statistics-gateway.ts` e bridging em `src/lib/actions/stats.ts`.
- [x] **Auditoria e Registros:**
  - Aprovado em 178/267 operações aceitas (`statistics: 12/22`).

---

## Contexto Statistics: Subfatia 4 - Operações Sazonais - Concluída ✅

### Operações Cobertas (4 operações)

1. `getLatestPlayerCardOverallMap` (`src/lib/actions/stats.ts`)
2. `getSeasonTeamStandings` (`src/lib/actions/team-standings.ts`)
3. `previewReprocessSeason` (`src/lib/actions/reprocess.ts`)
4. `executeReprocessSeason` (`src/lib/actions/reprocess.ts`)

### Checklist da Subfatia 4

- [x] Domínio puro para OVR das cartas e classificação dos clubes.
- [x] Caso de uso com validação do escopo de pelada.
- [x] Repositório PostgreSQL autenticado e autorização administrativa explícita.
- [x] Rotas Fastify, gateway HTTP e bridges das Server Actions.
- [x] Contratos legados preservados; nenhuma mutação é repetida após falha da API habilitada.
- [x] Auditoria aprovada em **182/267 (68,2%)**, `statistics: 16/22`.

---

## Contexto Fantasy: Subfatia 1 - Mercado, Escalações e Resumos (11 operações)

### Operações Cobertas
1. `getFantasyDashboard` (`src/lib/actions/fantasy.ts`)
2. `getFantasyPlayerDetail` (`src/lib/actions/fantasy.ts`)
3. `getFantasyPlayerSummary` (`src/lib/actions/fantasy.ts`)
4. `getFantasyQuickHighlights` (`src/lib/actions/fantasy.ts`)
5. `getMyFantasySummary` (`src/lib/actions/fantasy.ts`)
6. `getMyFantasyHistory` (`src/lib/actions/fantasy.ts`)
7. `getRevealedLineups` (`src/lib/actions/fantasy.ts`)
8. `getFantasyRoundLineupOverview` (`src/lib/actions/fantasy.ts`)
9. `saveFantasyLineup` (`src/lib/actions/fantasy.ts`)
10. `previewFantasyMarketV11` (`src/lib/actions/fantasy.ts`)
11. `repairLegacySavedFantasyLineups` (`src/lib/actions/fantasy.ts`)

### Checklist da Subfatia 1
- [ ] **Backend - Domínio e Casos de Uso (`backend/src/contexts/fantasy/`)**
  - Entidades de mercado, atletas, pontuação BQ v5, projeção e regras de escalação (`market-lineup.ts`).
  - Casos de uso: `manage-fantasy-market.ts` (dashboard, atleta, destaques, escalação, validações de orçamento/capitão/posições).
  - Testes unitários puros de domínio e aplicação.
- [ ] **Backend - Infraestrutura e Apresentação**
  - Repositório PostgreSQL autenticado via `SET LOCAL ROLE authenticated` e RPCs determinísticas.
  - Rotas Fastify em `market-lineup-route.ts` sob `ENABLE_FANTASY_API`.
  - Testes de repositório e rotas Fastify.
- [ ] **Frontend - Gateway e Sessão de API (`src/modules/fantasy/`)**
  - `http-fantasy-gateway.ts` e `fantasy-api-session.ts`.
  - Testes unitários de gateway e session factory.
- [ ] **Frontend - Bridging nas Server Actions (`src/lib/actions/fantasy.ts`)**
  - Conexão com a API quando `FANTASY_API_ENABLED=true` e fallback legado completo.
  - Testes unitários de paridade em `src/lib/actions/fantasy.test.ts`.

---

## Contexto Fantasy: Subfatia 2 - Rankings, Histórico, Sessões de Teste e Gestão (11 operações)

### Operações Cobertas
1. `getFantasyRanking` (`src/lib/actions/fantasy.ts`)
2. `getFantasyUserHistory` (`src/lib/actions/fantasy.ts`)
3. `getFantasyUserRoundHistory` (`src/lib/actions/fantasy.ts`)
4. `getSeasonPassDashboard` (`src/lib/actions/fantasy.ts`)
5. `getFantasyAdminData` (`src/lib/actions/fantasy.ts`)
6. `updateFantasySettings` (`src/lib/actions/fantasy.ts`)
7. `reprocessFantasyRound` (`src/lib/actions/fantasy.ts`)
8. `reprocessFantasyRoundWithCurrentRules` (`src/lib/actions/fantasy.ts`)
9. `createFantasyTestSession` (`src/lib/actions/fantasy.ts`)
10. `processFantasyTestSession` (`src/lib/actions/fantasy.ts`)
11. `resetFantasyTestSession` (`src/lib/actions/fantasy.ts`)

### Checklist da Subfatia 2 - Concluída ✅
- [x] **Backend - Domínio e Casos de Uso:**
  - Modelos de ranking, histórico e auditoria administrativa (`fantasy-admin.ts`).
  - Casos de uso para ranking sazonal/mensal, histórico por usuário, sessões de teste e recálculo de rodada.
  - Testes unitários de domínio e aplicação.
- [x] **Backend - Infraestrutura e Apresentação:**
  - Repositório PostgreSQL e rotas Fastify em `fantasy-admin-route.ts`.
  - Testes de repositório e rotas Fastify.
- [x] **Frontend - Gateway e Bridging:**
  - Métodos correspondentes no gateway HTTP.
  - Bridging em `src/lib/actions/fantasy.ts` com testes unitários em `fantasy.test.ts`.
  - Auditoria: Fantasy 22/22 (100%) concluído!

---

## Contexto Cards: Conclusão Integral (15 operações) - Concluído ✅

### Operações Cobertas
1. `getMyPacks` (`src/lib/actions/fantasy-cards.ts`)
2. `restoreMyPassPacks` (`src/lib/actions/fantasy-cards.ts`)
3. `openPack` (`src/lib/actions/fantasy-cards.ts`)
4. `claimPackCard` (`src/lib/actions/fantasy-cards.ts`)
5. `getMyInventory` (`src/lib/actions/fantasy-cards.ts`)
6. `getMyInventoryCount` (`src/lib/actions/fantasy-cards.ts`)
7. `getActiveCardForRound` (`src/lib/actions/fantasy-cards.ts`)
8. `activateCardForRound` (`src/lib/actions/fantasy-cards.ts`)
9. `removeActiveCardForRound` (`src/lib/actions/fantasy-cards.ts`)
10. `generatePacksForFinishedRound` (`src/lib/actions/fantasy-cards.ts`)
11. `giveMyAccountTestPack` (`src/lib/actions/fantasy-cards.ts`)
12. `resetMyAccountCards` (`src/lib/actions/fantasy-cards.ts`)
13. `distributePackToAllLineupUsers` (`src/lib/actions/fantasy-cards.ts`)
14. `auditAndRepairCurrentSeasonPacks` (`src/lib/actions/fantasy-cards.ts`)
15. `grantFantasyPackToUser` (`src/lib/actions/fantasy-cards.ts`)

### Checklist de Cards
- [x] **Backend - Domínio e Casos de Uso (`backend/src/contexts/cards/`):**
  - Entidades de pacotes, inventário, raridades, ativação por rodada e auditoria (`cards.ts`).
  - Casos de uso: `manage-cards.ts`.
  - Testes unitários puros de domínio e aplicação (9 testes passando).
- [x] **Backend - Infraestrutura e Apresentação:**
  - Repositório PostgreSQL (`pg-cards-repository.ts`) e rotas Fastify (`cards-route.ts`) sob `ENABLE_CARDS_API`.
  - Testes unitários de repositório e rotas Fastify (7 testes passando).
- [x] **Frontend - Módulo Cards (`src/modules/cards/`):**
  - Gateway HTTP (`http-cards-gateway.ts`) e sessão (`cards-api-session.ts`).
  - Testes unitários de gateway e sessão (5 testes passando).
- [x] **Frontend - Bridging nas Server Actions (`src/lib/actions/fantasy-cards.ts`):**
  - Bridging com fallback legado preservado e testes de paridade em `fantasy-cards.test.ts` (6 testes passando).
  - Auditoria: Cards 15/15 (100%) concluído! Total geral do projeto: 244/267 (91,4%) aceitas!

