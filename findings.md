# Descobertas e Decisões Técnicas: Pontuação BQ v5 e Sorteio por Velocidade

## 0. Auditoria de Paridade do Lote Operacional (28/10/2026)

- **Descoberta:** a existência de domínio, caso de uso, repositório, rota, gateway e teste mockado não comprova paridade. Os commits sincronizados marcaram 80 operações de convocações, rodadas e partidas como `frontend-migrated`, embora algumas implementações tenham omitido efeitos do fluxo legado ou estejam vazias.
- **Evidências:** `shuffleRoundTeams` não altera estado; `finishRound` apenas muda o status da rodada e perde fechamento financeiro, consolidação de estatísticas e Cartola; `finishMatch` perde tempos de saída, recálculo, sugestão da próxima partida e notificações. Os testes unitários existentes validavam chamadas ao mock, não os efeitos no banco restaurado.
- **Decisão arquitetural:** separar progresso estrutural (150/267) de progresso aceito na revisão (70/267) e de homologação (`verified`, 0/267). As flags do lote operacional permanecem desligadas até cada operação ser comparada com o fluxo legado e exercitada no Supabase local restaurado.
- **Correção aplicada:** leituras passaram a exigir sessão coerente com a RLS da migration 255; sessões sem token mantêm o fallback legado; a abertura de convocação cria sua pré-lista na mesma transação e preserva o contrato da Server Action; fallbacks SQL parciais foram retirados para manter as RPCs versionadas como autoridade.
- **Aceite incremental:** as 21 operações de convocação foram comparadas com o fluxo legado. Foram corrigidos escopo de estádio, trava de lista incompleta, idempotência da pré-lista e agendamento do Cartola. Quatro operações de sorteio de rodada também passaram ao padrão: a prévia usa o algoritmo de domínio e atributos escopados da pelada; aplicação aleatória e aplicação aprovada usam as RPCs canônicas.
- **Métrica auditável:** `architecture/operation-parity-status.json` separa revisão de paridade de ponte estrutural e homologação. No aceite anterior, o auditor registrava 113/267 aceitas e 154 pendentes.
- **Aceite atual:** o auditor registra 145/267 aceitas e 122 pendentes; `verified` continua 0 até o smoke no Supabase local restaurado.
- **Rodadas:** 38/38 operações estão aceitas em revisão de código. Além dos leitores, sorteio, pré-lista, ciclo, Draft e equilíbrio adaptativo, as correções de participantes agora usam as RPCs canônicas completas, preservam o motivo da zeragem e mantêm o recálculo de estatísticas, Cartola e overall. A homologação integrada ainda depende do banco local restaurado.
- **Partidas:** 16/21 operações estão aceitas. Além de gols, goleiros e substituições, abertura, detalhe, encerramento e exclusão agora preservam escalação completa, idempotência, tempo oficial, efeitos derivados e escopo por pelada. Restam as cinco integrações do cronômetro com QStash/Web Push.

## 1. Unificação de Pontuação e Integridade de Centésimos
- **Descoberta:** O sistema Ranked e o Fantasy possuíam discrepâncias históricas na base (ex: ausência de pontos de empate no Cartola, pesos de gols sofridos e bônus de atleta defensivo acoplado na base do Cartola).
- **Decisão Arquitetural:** 
  - Todo o cálculo BQ opera com centésimos inteiros (`Math.round(x * 100)`) em `src/lib/bq-scoring.ts` para anular qualquer erro de ponto flutuante (`0.1 + 0.2 != 0.3`).
  - O bônus DEF na base do atleta foi completamente eliminado do Cartola (`cleanSheets * 1.0` removido da base). Agora a proteção defensiva é apurada exclusivamente na vaga de escalação DEF.
  - As 8 métricas básicas foram alinhadas tanto em código quanto em banco (`ranking_rules` e `fantasy_settings`).

## 2. Teto e Bônus Posicionais no Cartola
- **Descoberta:** Atletas na vaga de zagueiro/defensor podiam acumular Clean Sheets excessivos gerando distorção estatística em relação a atacantes e meias.
- **Decisão Arquitetural:**
  - DEF: Clean Sheet (+1.5/jogo), Proteção Parcial (+0.5/jogo se sofreu exatamente 1 gol), Bônus Muralha (+3 se ≥ 3 clean sheets). O somatório total do bônus DEF possui teto determinístico de **10.0 pontos** (`min(10.0, rawBonus)`).
  - MEI: Bônus de Assistência (+1.0/assistência) e Bônus Maestro (+3 se ≥ 2 assistências).
  - ATA: Bônus Artilheiro (+3 se ≥ 2 gols).
  - GOL: Bônus Clean Sheet de Goleiro (+4 se ≥ 1 jogo sem sofrer gols atuando no gol).
  - Capitão: Multiplicador exato de 1.5x aplicado diretamente sobre o total da pontuação final da rodada.

## 3. Segurança no Reprocessamento de Temporadas
- **Descoberta:** Reprocessar uma temporada com mercado aberto ou rodada em andamento corrompe snapshots ou gera concorrência no fechamento.
- **Decisão Arquitetural:**
  - Criação das funções SQL `preview_reprocess_season` e `reprocess_active_season_v5` com trava estrita: aborta imediatamente com exceção se houver rodada com status `in_progress` ou com mercado em status `open`.
  - Execução atômica dentro de transação, atualizando `fantasy_lineup_players`, `fantasy_lineups` e o ranking da temporada.
  - Tela admin com prévia detalhada, cards informativos e modal com confirmação dupla para evitar disparos acidentais.

## 4. Algoritmo de Sorteio por Velocidade e Privacidade
- **Descoberta:** O atributo de velocidade dos jogadores é uma métrica subjetiva do administrador e não deve ser exposta aos usuários comuns da liga.
- **Decisão Arquitetural:**
  - Tabela `player_admin_attributes` protegida com RLS restrita ao papel `service_role` ou verificada via server action com credenciais de admin (`requireAdminPermission`).
  - Tratamento de nulos: Atletas sem avaliação de velocidade registrada são tratados estritamente em memória com o valor neutro padrão de **2 estrelas** (`2★`), sem persistência de registros desnecessários.
  - O algoritmo `drawTeamsBySpeed` distribui os jogadores em serpentina ordenados por velocidade e realiza otimização por troca local (`localSwap`) para minimizar a variância da média de velocidade entre os times.
  - Proteção de borda: Se `teamCount < 2`, a troca local é abortada imediatamente sem disparar erro de índice.

## 5. Reorganização de Arquitetura: Contexto Roster (Elenco)
- **Descoberta:** As operações de mutação de jogadores (`savePlayer`, `deletePlayer` e `mergeGuestWithRegistered`) combinam lógica de persistência no PostgreSQL/Supabase, upload/remoção de avatares no Storage e recálculo em cascata (estatísticas de rodadas, recálculo de Fantasy e overall fluido).
- **Decisão Arquitetural:**
  - Cada operação no backend foi encapsulada em seu respectivo caso de uso (`save-player-profile`, `get-roster-registration` com `mergePlayers`) rodando transação autenticada com validação de administrador da pelada via `public.is_league_admin()`.
  - A união de perfis (`mergeGuestWithRegistered`) preserva a verificação `can_merge_profiles_in_league` e a execução da RPC `merge_selectable_player_profiles`, retornando com segurança os `affectedRoundIds` para recálculo.
  - O gateway `httpRosterGateway` no frontend fornece o contrato tipado `mergeGuestWithRegistered` e as Server Actions mantêm um fallback gracioso para RPCs legadas enquanto as pontes de homologação local estiverem sob feature flags.
  - Com isso, o contexto `roster` atinge 100% de cobertura (35 de 35 operações migradas).

## 6. Reorganização de Arquitetura: Contexto Rounds (Rodadas)
- **Descoberta:** O contexto `rounds` com 38 operações inclui fluxos de persistência pesados (criação de rodada com sorteio, encerramento de rodada com recálculo de scouts e integração com o Cartola).
- **Decisão Arquitetural:**
  - Encapsulamento completo no backend sob `backend/src/contexts/rounds/` com repositório PostgreSQL dedicado (`pg-round-repository.ts`) e rotas Express autenticadas.
  - No frontend, o gateway `httpRoundGateway` e a sessão `roundApiFor` abstraem as chamadas REST, mantendo o fallback gracioso nas server actions legadas.
  - Conclusão com 100% de cobertura (38 de 38 operações migradas).

## 7. Reorganização de Arquitetura: Contexto Matches (Partidas)
- **Descoberta:** O contexto `matches` possui 21 operações, com alta sensibilidade a tempo de execução no frontend (ações de cronômetro, substituições ao vivo, auditoria e registro/correção de gols).
- **Decisão Arquitetural:**
  - **Tipagem de Gateways REST vs. Discriminated Unions:** Métodos de gateway que lançam exceção em caso de erro HTTP devem tipar seu retorno com `success: true` literal, e não `success: boolean`. Isso permite que o compilador TypeScript do Next.js discrimine perfeitamente os branches de sucesso e falha (ex.: checagens de `res.matchId`, `res.newDuration`, `res.skipped`), eliminando erros de compilação nos componentes React (`MatchLiveBoard`, `MatchCreator`, `DeleteMatchButton`).
  - **Escopo do Next.js Runtime em Testes:** Funções que usam `after()` de `next/server` ou `cookies()` de `next/headers` (através de `createServerClient()`) devem ter `next/server` mockado nos testes unitários do Vitest e chamadas de gateway devem ser avaliadas antes da inicialização de clientes dependentes de cookies, permitindo execução pura sem request context.
  - O lote `matches` alcançou 100% de cobertura (21 de 21 operações migradas), concluindo integralmente o **Lote 3: Jogo Operacional**.

## 8. Reorganização de Arquitetura: Contexto Notifications - Subfatia 1 (Inbox)
- **Descoberta:** O contexto `notifications` possui 16 operações no total, iniciando pelas operações de Inbox (`getMyInboxPreview`, `markInboxRead` e `getMyInboxNotifications`). A tabela `user_inbox_notifications` possui chave única `(user_id, dedupe_key)`, estados `active` e `resolved`, e restrição estrita de RLS por usuário autenticado (`user_id = auth.uid()`).
- **Decisão Arquitetural:**
  - Seguir a divisão incremental recomendada no handoff: Subfatia 1 cobrindo a central e prévia do Inbox (`getMyInboxPreview`, `markInboxRead`, `getMyInboxNotifications`).
  - No backend, criar `backend/src/contexts/notifications/` com porta `InboxRepository`, garantindo que toda consulta PostgreSQL aplique `SET LOCAL ROLE authenticated` e utilize o identificador do ator autenticado (`actor.userId`) a partir do token Bearer verificado.
  - Implementar o gateway HTTP no frontend sob `src/modules/notifications/` com session factory `notificationApiFor` controlada pela feature flag `NOTIFICATIONS_API_ENABLED`.
  - As Server Actions preservam 100% da assinatura pública original e mantêm o fallback legado enquanto a flag estiver desligada.

## 9. Reorganização de Arquitetura: Contexto Notifications - Subfatia 2 (Preferências e Push)
- **Descoberta:**
  - O status do sistema de notificações reflete `isBackgroundAlertsConfigured`, indicando a disponibilidade de QStash (`QSTASH_TOKEN` e `MATCH_TIMER_WEBHOOK_SECRET`) e chaves VAPID (`VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY`).
  - A chave pública VAPID é derivada deterministicamente da chave privada no backend usando curva elíptica `prime256v1` ECDH sem compressão (`base64url`), evitando falhas geradas por variáveis públicas desatualizadas.
  - As preferências de notificação (`match_push_enabled`, `callup_push_enabled`, `cartola_push_enabled`, etc.) utilizam fallback `true` quando ainda não foram gravadas para o usuário, permitindo comunicação imediata para novos membros.
  - Para leitura do estado de e-mail testado (`cartola_email_tested_at`) e lembretes habilitados (`cartola_reminders_enabled`), a consulta junta preferências do usuário e atributos da liga ativa.
- **Decisão Arquitetural:**
  - Encapsular as operações de preferências e inscrições push sob `backend/src/contexts/notifications/domain/`, `application/manage-preferences.ts`, e repositórios PostgreSQL `pg-notification-preferences-repository.ts` e `pg-push-subscription-repository.ts`.
  - Rotas Fastify em `preferences-route.ts` registradas sob `ENABLE_NOTIFICATIONS_API`.
  - No frontend, métodos adicionados ao gateway HTTP `HttpNotificationGateway` e Server Actions `src/app/mais/notification-actions.ts` com fallback e testes de paridade.
  - Conclusão com 9 de 16 operações aceitas em Notifications (159/267 no total).

## 10. Reorganização de Arquitetura: Contexto Notifications - Subfatia 3 (Entrega Push, Testes e Webhook Interno)
- **Descoberta:**
  - O fluxo de teste push (`sendPushTest`) é assíncrono: a Server Action agenda o job no QStash com delay de 10s apontando para o webhook de entrega. O webhook interno autentica via `Bearer MATCH_TIMER_WEBHOOK_SECRET` e despacha o push real para as inscrições do usuário alvo.
  - Se um endpoint do navegador retornar 404 ou 410 (Gone), a assinatura é considerada expirada e deve ser removida atomicamente do banco pelo sender para manter a tabela limpa e rápida.
  - O teste de e-mail do Cartola (`sendCartolaEmailTest`) exige perfil de administrador com e-mail válido, usa o Resend com template HTML e link seguro de cancelamento (assinado com HMAC SHA-256 via `EMAIL_UNSUBSCRIBE_SECRET`), e registra o timestamp ISO `cartola_email_tested_at` na tabela `leagues`.
- **Decisão Arquitetural:**
  - Criar portas explícitas no backend:
    - `PushAlertScheduler` para agendamento de testes no QStash com delay.
    - `PushNotificationSender` para envio de mensagens Web Push com auto-limpeza de assinaturas expiradas (404/410).
    - `CartolaEmailSender` para envio transacional de e-mails via Resend com token assinado de unsubscribe.
    - `LeagueNotificationSettingsRepository` para leitura/gravação de `cartola_email_tested_at` e `cartola_reminders_enabled`.
  - Casos de uso atômicos:
    - `TriggerPushTestUseCase`: agenda o alerta de teste push.
    - `DeliverPushTestAlertUseCase`: entrega o teste push real ao usuário com base no Bearer secret do webhook interno.
    - `SendCartolaEmailTestUseCase`: envia o e-mail de teste para o ADM logado e grava `cartola_email_tested_at`.
  - Rotas Fastify expostas:
    - `POST /api/notifications/test-push`
    - `POST /api/notifications/test-cartola-email`
    - `POST /api/internal/notifications/push-test-alert` (webhook interno)

## 11. Reorganização de Arquitetura: Contexto Notifications - Subfatia 4 (Lembretes do Cartola e E-mail)
- **Descoberta:**
  - A ativação do envio de lembretes (`setCartolaRemindersEnabled`) exige que o ADM tenha testado previamente o e-mail (`cartola_email_tested_at` não nulo na liga) e agenda automaticamente os lembretes caso haja rodada oficial com mercado aberto.
  - O cancelamento de lembretes (`cancelCartolaEmailReminders`) opera em rota pública segura usando assinatura HMAC SHA-256 (`cartola-email:${userId}`) gerada com `EMAIL_UNSUBSCRIBE_SECRET`, sem expor ou depender de sessão de login.
  - O processamento de lembretes (`dispatchCartolaReminder`) roda de forma estritamente idempotente usando claim transacional em `cartola_reminder_deliveries (round_id, user_id, milestone, channel)` com status `pending` e tolerância a reclaim após 10 minutos para contornar travamentos em falhas de rede.
- **Decisão Arquitetural:**
  - Criação de domínio puro `cartola-reminder.ts` encapsulando cálculo de horários de início e geração/verificação de token seguro de cancelamento.
  - Porta `CartolaReminderRepository` encapsulando consultas e atualizações de liga, busca de candidatos com escalação incompleta e claims/registros de entrega.
  - Adaptadores `qstashCartolaReminderScheduler`, `resendCartolaReminderEmailSender` e `pgCartolaReminderRepository`.
  - Rotas Fastify `/api/notifications/cartola/reminders/toggle`, `/api/notifications/cartola/reminders/cancel` e `/api/internal/notifications/cartola-reminder`.
  - Bridging no frontend preservando fallbacks legados sob feature flags.
  - Conclusão com 15 de 16 operações aceitas em Notifications (165/267 no total).

## 12. Reorganização de Arquitetura: Contexto Notifications - Subfatia 5 e Conclusão Integral (16/16)
- **Descoberta:**
  - A última operação restante no contexto Notifications era o webhook interno de cronômetro `POST /api/internal/match-timer-alert`.
  - Esse endpoint recebe requisições autenticadas pelo segredo `MATCH_TIMER_WEBHOOK_SECRET` disparadas pelo QStash para alertar marcos da partida (`one_minute`, `thirty_seconds`, `finished`).
  - Quando um marco é chamado prematuramente pelo agendador antes do tempo real decorrido, o sistema deve responder com status HTTP 425 e cabeçalho `Retry-After: 1`, instruindo o QStash a retentar a entrega imediatamente.
- **Decisão Arquitetural:**
  - O gateway `httpNotificationGateway` expõe `dispatchMatchTimerAlert(matchId, threshold, webhookSecret)` roteando para o endpoint de entrega do contexto Notifications `/api/internal/notifications/match-timer-alert`.
  - A rota Next.js `src/app/api/internal/match-timer-alert/route.ts` consome o gateway sob a flag `NOTIFICATIONS_API_ENABLED === "true"` e, quando `result.skipped && result.reason === "too_early"`, preserva estritamente a resposta 425 com o cabeçalho `Retry-After: 1`.
  - O backend reivindica o marco via porta de Matches, resolve assinaturas apenas dos jogadores da rodada com preferência ativa, entrega o Web Push e libera a reivindicação exata se nenhuma entrega tiver sucesso.
  - O fallback legado Supabase permanece intacto e funcional quando a flag estiver desligada.
  - Com isso, o contexto `notifications` atinge **16 de 16 operações aceitas (100% de paridade)**, elevando o total do sistema para **166 de 267 operações aceitas (62,2%)**.

## 13. Reorganização de Arquitetura: Contexto Statistics - Subfatia 1 (Regras de Pontuação BQ v5 e Coluna C)
- **Descoberta:**
  - As operações `getBQScoringRules`, `getColumnCScoringRules`, `saveBQScoringRules` e `saveColumnCScoringRules` gerenciam as regras canônicas de pontuação de rodadas da pelada.
  - `getColumnCScoringRules` herda as configurações do Cartola da pelada e aplica o snapshot canônico da Coluna C, no qual `COLUMN_C_SCORING.GOL` define `appearance: 1` e `conceded: -0.5`.
  - `saveColumnCScoringRules` consome a RPC `save_column_c_scoring_settings` com o parâmetro `p_reprocess_ranked` para atualizar a temporada ativa quando solicitado.
- **Decisão Arquitetural:**
  - Domínio `backend/src/contexts/statistics/domain/scoring-policy.ts` encapsulando `normalizeBQScoringRules`, `normalizeColumnCScoringRules` e cálculos seguros com centésimos inteiros.
  - Caso de uso `manage-scoring-rules.ts` com transação autenticada e verificação de privilégios de administrador de pelada.
  - Repositório `pg-scoring-rules-repository.ts` conectado via `SET LOCAL ROLE authenticated` e rotas Fastify em `scoring-rules-route.ts`.
  - Gateway frontend `http-statistics-gateway.ts` e session factory `statistics-api-session.ts` com a flag `STATISTICS_API_ENABLED`; `ENABLE_STATISTICS_API` fica restrita ao processo backend.
  - Conexão em `src/lib/actions/bq-scoring.ts` preservando fallback legado e total paridade funcional (170/267 no total).

## 14. Reorganização de Arquitetura: Contexto Statistics - Subfatia 2 (Núcleo do Ranking Oficial e Desempates)
- **Descoberta:**
  - As operações `getRanking`, `getRankingEssentialData`, `getPlayerRankingEntry`, `getRankingExperienceData` e `getRankingEnrichmentForPlayers` formam o coração analítico e público da temporada de pelada.
  - O ranking oficial é baseado nas **6 melhores rodadas** de cada atleta na temporada ativa (`status: finished`, `round_type: official`).
  - Critérios de desempate canônicos e imutáveis:
    1. Pontos das 6 melhores rodadas (`points`)
    2. Vitórias acumuladas na temporada (`wins`)
    3. Gols acumulados na temporada (`goals`)
    4. Assistências acumuladas na temporada (`assists`)
  - A elegibilidade pública exige cadastro competitivo completo (`is_competitive_profile_complete`) e presença em ao menos 1 partida nas últimas 3 rodadas realizadas.
  - Atletas inativos ou sem jogos recentes permanecem no histórico completo, mas saem do corte público ativo da temporada.
- **Decisão Arquitetural:**
  - O domínio `backend/src/contexts/statistics/domain/season-ranking.ts` já implementa `buildSeasonRankingCore(...)`. Expandir ou complementar com as entidades de ranking da temporada, visão mensal e última rodada, bem como os enriquecimentos cosméticos e de rendimento.
  - Caso de uso `manage-season-ranking.ts` no backend orquestrando a obtenção do ranking essencial, detalhado e por jogador.
  - Repositório PostgreSQL `pg-season-ranking-repository.ts` realizando consultas otimizadas e escopadas por `league_id` e `season_id`.
  - Rotas Fastify em `season-ranking-route.ts`.
  - Expansão do `http-statistics-gateway.ts` no frontend para suportar ranking, dados essenciais, enrichments e entrada individual de atleta.
  - Conexão das Server Actions em `src/lib/actions/stats.ts` com fallback transparente caso a flag de API esteja desligada.
  - **Invariante Next.js Server Actions:** arquivos com a diretiva `"use server"` só podem exportar funções assíncronas (e declarações de tipo com `export type`). Exportar valores ou constantes normais (como `export const DEFAULT_COLUMN_C_SCORING = ...`) gera falha de compilação no `next build` (`invalid-use-server-value`). A constante padrão foi transferida para `src/lib/column-c-scoring.ts`, preservando a pureza das Server Actions.
  - Marco atingido: **500 testes passando no backend** (131 arquivos) e **1.130 testes passando no frontend** (212 arquivos), com **175 de 267 operações aceitas (65,5%)**.

## 15. Reorganização de Arquitetura: Contexto Statistics - Subfatia 3 (Scouts de Rodada e Amistosos)
- **Descoberta:** `calculateRoundStats` é uma unidade transacional, não apenas um somatório. Além dos scouts, preserva elegibilidade por rodada, substitutos sem pontuação, snapshots de goleiro, perfis congelados, regras históricas, overrides administrativos e reconciliação do Cartola.
- **Decisão:** manter o cálculo determinístico no domínio, a autorização/leitura/gravação no repositório PostgreSQL e executar upsert e reconciliação antes do mesmo commit. A feature flag só escolhe o caminho; erro da API ativa não repete a mutação no Supabase legado.
- **Leituras:** `getRoundStatistics` e `getFriendlyStats` são escopadas por `league_id`/temporada, omitem inscrições com zero jogos e mantêm a view sazonal como read model canônico.
- **Resultado:** Statistics alcança **12/22**, e a aplicação **178/267 (66,7%)**.

## 16. Reorganização de Arquitetura: Contexto Statistics - Subfatia 4 (Operações Sazonais)

- **Descoberta:** mapa de OVR e classificação por times são read models sazonais; prévia e execução de reprocessamento são uma única fronteira administrativa sustentada por RPCs atômicas existentes.
- **Decisão:** manter agregações determinísticas no domínio e preservar `preview_reprocess_season`/`reprocess_active_season_v5` como autoridades transacionais, acrescentando autenticação e `is_app_admin()` explícitos no backend.
- **Paridade:** os bridges mantêm `Map` no OVR, as respostas de erro da prévia/execução e o fallback legado somente com `STATISTICS_API_ENABLED` desligada.
- **Resultado:** Statistics alcança **16/22**, e a aplicação **182/267 (68,2%)**.





